import asyncio
import os
import json
import requests
from nats.aio.client import Client as NATS
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_postgres import PGVector
from langchain_postgres.vectorstores import PGVector
from langchain_core.documents import Document
from langchain_core.messages import SystemMessage, HumanMessage
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from typing import Annotated, TypedDict, List, Dict, Any, Optional, Literal
import operator
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
DB_DSN = os.getenv("DB_DSN", "postgres://postgres:postgres@localhost:5432/septimus_db")
# Fallback keys if not found in DB
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend-core:4000")

async def get_active_llm(workspace_id: str):
    """
    Fetch the configured AI providers from the Go Backend,
    and initialize the correct LangChain model.
    """
    try:
        res = requests.get(f"{BACKEND_URL}/internal/settings/ai_providers?workspace_id={workspace_id}", timeout=5)
        if res.status_code == 200:
            providers = res.json()
            # providers is a list of dicts
            for p in providers:
                if p.get("isActive"):
                    provider_name = p.get("provider")
                    api_key = p.get("apiKey", "")
                    base_url = p.get("baseUrl", "")

                    if provider_name == "openai":
                        return ChatOpenAI(model="gpt-4o", openai_api_key=api_key)
                    elif provider_name == "gemini":
                        return ChatGoogleGenerativeAI(model="gemini-1.5-pro", google_api_key=api_key)
                    # Add others (anthropic, ollama)
                    break
    except Exception as e:
        print(f"Error fetching settings via HTTP: {e}")

    # Fallback to env vars
    print("Falling back to environment variables")
    if GOOGLE_API_KEY:
        return ChatGoogleGenerativeAI(model="gemini-1.5-pro", google_api_key=GOOGLE_API_KEY)
    elif OPENAI_API_KEY:
        return ChatOpenAI(model="gpt-4o", openai_api_key=OPENAI_API_KEY)
    
    
    return None

def get_active_embeddings(workspace_id: str):
    """
    Fetch configured API keys and initialize embeddings model.
    """
    try:
        res = requests.get(f"{BACKEND_URL}/internal/settings/ai_providers?workspace_id={workspace_id}", timeout=5)
        if res.status_code == 200:
            providers = res.json()
            for p in providers:
                if p.get("isActive"):
                    provider_name = p.get("provider")
                    api_key = p.get("apiKey", "")
                    
                    if provider_name == "openai":
                        return OpenAIEmbeddings(openai_api_key=api_key)
                    elif provider_name == "gemini":
                        return GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=GOOGLE_API_KEY or api_key)
                    break
    except Exception as e:
        print(f"Error fetching settings for embeddings via HTTP: {e}")

    # Fallback to env vars
    if GOOGLE_API_KEY:
        return GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=GOOGLE_API_KEY)
    elif OPENAI_API_KEY:
        return OpenAIEmbeddings(openai_api_key=OPENAI_API_KEY)
    
    return None

async def message_handler(msg):
    subject = msg.subject
    data = json.loads(msg.data.decode())
    print(f"Received a message on '{subject}': {data}")

    if subject == "events.tasks.created":
        task_id = data.get("task_id")
        title = data.get("title", "")
        description = data.get("description", "")
        story_points = data.get("story_points", 0)

        if story_points == 0:
            print(f"Task '{title}' has 0 story points. Estimating...")
            llm = await get_active_llm(data.get("workspace_id") or os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e"))
            if llm:
                prompt = f"Estimate the story points (Fibonacci: 1, 2, 3, 5, 8, 13) for the following task. Respond ONLY with an integer number and nothing else.\nTitle: {title}\nDescription: {description}"
                try:
                    response = await llm.ainvoke(prompt)
                    pts = int(response.content.strip())
                    print(f"Estimated points: {pts}")

                    # Update the task via Backend API
                    import aiohttp
                    api_url = os.getenv("API_URL", f"{BACKEND_URL}/api/v1")
                    async with aiohttp.ClientSession() as session:
                        async with session.put(f"{api_url}/system/tasks/{task_id}", json={"story_points": pts}) as resp:
                            if resp.status == 200:
                                print(f"Task {task_id} updated with {pts} points via API.")
                            else:
                                error_text = await resp.text()
                                print(f"Error updating task {task_id}: {error_text}")
                except Exception as e:
                    print(f"Error estimating story points: {e}")
            else:
                print("No active LLM found for estimation.")

    # For auto-triage and RAG, if it's a new chat message
    if subject == "events.messages.created":
        content = data.get("content", "")
        channel_id = data.get("channel_id")
        workspace_id = data.get("workspace_id") # Note: assuming this is passed
        if not workspace_id:
            # Fallback for MVP
            workspace_id = os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")

        llm = await get_active_llm(workspace_id)
        if llm:
            # RAG Retrieval
            embeddings = get_active_embeddings(workspace_id)
            context_text = ""
            if embeddings:
                try:
                    vectorstore = PGVector(
                        embeddings=embeddings,
                        collection_name="workspace_documents",
                        connection=DB_DSN,
                        use_jsonb=True,
                    )
                    docs = vectorstore.similarity_search(content, k=3)
                    if docs:
                        context_text = "\n".join([d.page_content for d in docs])
                        print(f"Retrieved {len(docs)} documents for context.")
                except Exception as e:
                    print(f"Error retrieving documents for RAG: {e}")

            system_prompt = "You are Septimus AI, a helpful enterprise assistant. Answer queries based on the provided Knowledge Base context if available. If the message implies a task needs to be created, add a JSON block at the end: {\"is_task\": true, \"title\": \"...\"}."
            
            messages = [SystemMessage(content=system_prompt)]
            if context_text:
                messages.append(SystemMessage(content=f"Knowledge Base Context:\n{context_text}"))
            
            messages.append(HumanMessage(content=content))

            try:
                response = await llm.ainvoke(messages)
                print(f"LLM Chat Response: {response.content}")
                
                await nc.publish("chat.message.ai_reply", json.dumps({
                    "content": response.content,
                    "channel_id": channel_id,
                    "workspace_id": workspace_id
                }).encode())
            except Exception as e:
                print(f"LLM Error: {e}")
        else:
            print("No active LLM configured.")

    if subject == "events.workflow.trigger":
        agent_type = data.get("agent_type", "default")
        prompt_template = data.get("prompt", "")
        context_data = data.get("context", {})
        thread_id = data.get("thread_id", "default-thread")
        
        workspace_id = context_data.get("workspace_id") or os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")
        llm = await get_active_llm(workspace_id)
        
        if llm:
            try:
                print(f"[{agent_type.upper()} AGENT] Invoking ReAct LangGraph...")
                
                # Mock Database Tool
                from langchain_core.tools import tool
                @tool
                def query_database(query: str) -> str:
                    """Query the database for insights. Use this when you need data."""
                    return f"Mock Data for query: {query}. Result: 15 active users found."
                
                @tool
                def search_knowledge(query: str) -> str:
                    """Search the company knowledge base, tasks, and documents."""
                    try:
                        res = requests.get(f"{BACKEND_URL}/internal/search/semantic?workspace_id={workspace_id}&q={query}&limit=3")
                        if res.status_code == 200:
                            data = res.json()
                            results = data.get("results", [])
                            if not results:
                                return "No relevant documents found."
                            
                            formatted = ""
                            for r in results:
                                formatted += f"- [{r['entity_type']}] {r['content']} (Data: {r.get('entity_data')})\n"
                            return f"Found the following context:\n{formatted}"
                        return "Failed to fetch from knowledge base."
                    except Exception as e:
                        return f"Error searching knowledge base: {e}"
                
                tools = [query_database, search_knowledge]
                
                # System Prompts based on agent type
                sys_prompts = {
                    "data analyst": "You are a specialized Data Analysis AI Agent. Use your tools to query databases and find insights. You must use tools when data is requested.",
                    "qa tester": "You are a specialized QA Tester Agent. Focus on testing and quality assurance.",
                    "workflow architect": "You are a specialized Workflow Architect Agent. Build workflows and processes."
                }
                
                sp = sys_prompts.get(agent_type.lower(), "You are a helpful AI Agent.")
                system_message = f"{sp}\nContext: {json.dumps(context_data)}"
                
                # Replace MemorySaver with PostgresSaver
                # We need a synchronous connection pool for PostgresSaver or use AsyncPostgresSaver
                # Since langgraph.checkpoint.postgres provides PostgresSaver (sync) or AsyncPostgresSaver (async). 
                # PostgresSaver can use psycopg_pool.ConnectionPool
                from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
                async with AsyncPostgresSaver.from_conn_string(DB_DSN) as memory:
                    # ensure tables exist
                    await memory.asetup()
                    
                    app = create_react_agent(llm, tools=tools, checkpointer=memory, state_modifier=system_message)
                    
                    config = {"configurable": {"thread_id": thread_id}}
                    inputs = {"messages": [("user", prompt_template)]}
                    
                    async for event in app.astream(inputs, config, stream_mode="values"):
                        message = event["messages"][-1]
                        message_type = type(message).__name__
                        if message_type == "AIMessage" and not getattr(message, "tool_calls", None):
                            print(f"Final Output from Agent: {message.content}")
                            # Optionally, publish the output back to NATS here
                        
            except Exception as e:
                print(f"[{agent_type.upper()} AGENT] LangGraph Error: {e}")
        else:
            print("No active LLM configured for workflow agent.")

    if subject == "document.uploaded":
        print("Received document uploaded event!")
        file_path = data.get("file_path", "")
        document_id = data.get("document_id", "")
        
        # We need a workspace ID for settings, try to fetch it if not provided
        workspace_id = data.get("workspace_id") or os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")
        
        if not os.path.exists(file_path):
            # In a distributed setup, the file might be on a different node.
            # But here they run locally, adjust path relative to sidecar cwd
            # The backend is in backend-core, so file_path (e.g. ./uploads/...) needs resolution.
            # We assume we can access it relative to the workspace root.
            file_path = os.path.join("../backend-core", file_path)
            
        if not os.path.exists(file_path):
            print(f"Error: Document file not found at {file_path}")
            return
            
        try:
            # 1. Load document
            print(f"Loading document: {file_path}")
            docs = []
            if file_path.endswith(".pdf"):
                loader = PyPDFLoader(file_path)
                docs = loader.load()
            else:
                loader = TextLoader(file_path)
                docs = loader.load()
                
            # 2. Split into chunks
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
            splits = text_splitter.split_documents(docs)
            
            # Add metadata
            for s in splits:
                s.metadata["document_id"] = document_id
                
            # 3. Embed and store
            embeddings = get_active_embeddings(workspace_id)
            if not embeddings:
                print("No embeddings model available. Cannot index document.")
                return
                
            print(f"Creating PGVector store in PostgreSQL...")
            vectorstore = PGVector(
                embeddings=embeddings,
                collection_name="workspace_documents",
                connection=DB_DSN,
                use_jsonb=True,
            )
            
            # This creates the vectorstore schema if it doesn't exist and adds the documents
            vectorstore.add_documents(splits)
            print(f"Successfully embedded and indexed {len(splits)} chunks for document {document_id}")
            
        except Exception as e:
            print(f"Error processing document: {e}")

    if subject == "huddle.speak":
        print("Received huddle speak request")
        import base64
        from openai import AsyncOpenAI
        
        file_path = data.get("file_path", "")
        workspace_id = data.get("workspace_id") or os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")

        if not os.path.isabs(file_path):
            file_path = os.path.join("../backend-core", file_path)

        if not OPENAI_API_KEY:
            # Fallback dummy response
            print("No OPENAI_API_KEY for STT/TTS. Returning dummy response.")
            if msg.reply:
                await msg.respond(json.dumps({
                    "text": "هذا رد تجريبي لأن مفتاح OpenAI غير متوفر.",
                    "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" # Empty valid wav header
                }).encode())
            return

        client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        
        try:
            # 1. Transcribe with Whisper
            with open(file_path, "rb") as audio_file:
                transcript = await client.audio.transcriptions.create(
                    model="whisper-1", 
                    file=audio_file,
                    language="ar" # Defaulting to Arabic for this user, though Whisper auto-detects well
                )
            
            user_text = transcript.text
            print(f"Huddle User said: {user_text}")

            # 2. Get LLM Response
            llm = await get_active_llm(workspace_id)
            if not llm:
                raise Exception("No active LLM found")
            
            system_prompt = "You are a helpful AI voice assistant in Septimus OS. Keep your answers brief, conversational, and natural for a voice call. Answer in Arabic."
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_text)
            ]
            response = await llm.ainvoke(messages)
            ai_text = response.content
            print(f"Huddle AI replied: {ai_text}")

            # 3. Text to Speech
            tts_response = await client.audio.speech.create(
                model="tts-1",
                voice="nova",
                input=ai_text
            )
            
            audio_bytes = tts_response.read()
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
            
            # Send response back to NATS Request
            if msg.reply:
                await msg.respond(json.dumps({
                    "text": ai_text,
                    "audio_base64": audio_base64
                }).encode())
                
        except Exception as e:
            print(f"Huddle error: {e}")
            if msg.reply:
                await msg.respond(json.dumps({
                    "error": str(e)
                }).encode())

    if subject == "crm.lead.score":
        print(f"Received CRM Lead Score request for data: {data}")
        lead_id = data.get("id")
        lead_name = data.get("name", "")
        lead_value = data.get("value", 0)
        workspace_id = data.get("workspace_id") or os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")

        llm = await get_active_llm(workspace_id)
        if llm:
            prompt = f"Analyze this CRM lead and return ONLY an integer between 1 and 100 representing the probability of closing this deal.\nLead Name: {lead_name}\nDeal Value: {lead_value}"
            try:
                res = await llm.ainvoke(prompt)
                score = int(res.content.strip())
                print(f"Calculated Lead Score for {lead_name}: {score}")
                
                if msg.reply:
                    await msg.respond(json.dumps({"score": score}).encode())
            except Exception as e:
                print(f"Error scoring lead: {e}")
                if msg.reply:
                    await msg.respond(json.dumps({"score": 50}).encode())
        else:
            print("No active LLM found for lead scoring.")
            if msg.reply:
                await msg.respond(json.dumps({"score": 50}).encode())

nc = NATS()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Connecting to NATS at {NATS_URL}...")
    await nc.connect(NATS_URL)

    # Listen for chat messages and task creation
    await nc.subscribe("events.messages.created", cb=message_handler)
    await nc.subscribe("events.tasks.created", cb=message_handler)
    await nc.subscribe("events.workflow.trigger", cb=message_handler)
    await nc.subscribe("document.uploaded", cb=message_handler)
    await nc.subscribe("huddle.speak", cb=message_handler)
    await nc.subscribe("crm.lead.score", cb=message_handler)

    print("AI Sidecar is running and listening to NATS events...")

    yield

    await nc.drain()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SprintPlanRequest(BaseModel):
    capacity: int
    backlog: List[Dict[str, Any]]

class ChatRequest(BaseModel):
    agent_type: str
    message: str
    context: dict = {}
    thread_id: str = "default-thread"
    system_prompt: Optional[str] = None

@app.post("/api/v1/ai/chat")
async def chat_with_agent(req: ChatRequest):
    workspace_id = req.context.get("workspace_id") or os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")
    llm = await get_active_llm(workspace_id)
    if not llm:
        return {"reply": "عذراً، لم يتم إعداد مزود الذكاء الاصطناعي (LLM) بعد."}
        
    try:
        from langchain_core.tools import tool
        from langgraph.prebuilt import create_react_agent
        from langgraph.checkpoint.memory import MemorySaver
        
        @tool
        def search_knowledge(query: str) -> str:
            """ابحث في مستندات الشركة، المهام، والسياسات عن أي معلومات مفيدة (Search Company Knowledge Base)."""
            try:
                res = requests.get(f"{BACKEND_URL}/internal/search/semantic?workspace_id={workspace_id}&q={query}&limit=3")
                if res.status_code == 200:
                    data = res.json()
                    results = data.get("results", [])
                    if not results:
                        return "لا توجد مستندات مطابقة."
                    formatted = ""
                    for r in results:
                        formatted += f"- [{r['entity_type']}] {r['content']} (Data: {r.get('entity_data')})\n"
                    return f"إليك المعلومات التي وجدتها:\n{formatted}"
                return "فشل البحث في قاعدة المعرفة."
            except Exception as e:
                return f"خطأ أثناء البحث: {e}"

        @tool
        def create_task(title: str, description: str) -> str:
            """إنشاء مهمة جديدة في النظام (Create a Task)."""
            try:
                payload = {
                    "title": title,
                    "description": description,
                    "status": "Todo",
                    "priority": 1,
                    "points": 0
                }
                res = requests.post(f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=task", json={"data": payload})
                if res.status_code in [200, 201]:
                    return "تم إنشاء المهمة بنجاح."
                return f"فشل إنشاء المهمة: {res.text}"
            except Exception as e:
                return f"خطأ أثناء إنشاء المهمة: {e}"

        @tool
        def create_crm_deal(title: str, value: float, stage: str) -> str:
            """إنشاء صفقة مبيعات جديدة في نظام الـ CRM (Create a CRM Deal)."""
            try:
                payload = {
                    "title": title,
                    "value": value,
                    "stage": stage,
                    "probability": 50
                }
                res = requests.post(f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=crm_deal", json={"data": payload})
                if res.status_code in [200, 201]:
                    return "تم إنشاء صفقة المبيعات بنجاح."
                return f"فشل إنشاء الصفقة: {res.text}"
            except Exception as e:
                return f"خطأ أثناء إنشاء الصفقة: {e}"

        @tool
        def get_hr_policy() -> str:
            """استرجاع سياسات الموارد البشرية الحالية (Get HR Policy)."""
            try:
                res = requests.get(f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=hr_policy")
                if res.status_code == 200:
                    data = res.json()
                    if data and data.get("data"):
                        return json.dumps(data["data"], ensure_ascii=False)
                return "لا توجد سياسة موارد بشرية محفوظة."
            except Exception as e:
                return f"خطأ في استرجاع السياسة: {e}"

        tools = [search_knowledge, create_task, create_crm_deal, get_hr_policy]

        sys_prompts = {
            "hr": "أنت مساعد الموارد البشرية الذكي (HR Assistant). يمكنك قراءة سياسات الإجازة للمساعدة. لديك أدوات للبحث.",
            "crm": "أنت مساعد المبيعات وعلاقات العملاء (CRM Assistant). هدفك تقييم العملاء المحتملين وصياغة ردود احترافية.",
            "finance": "أنت المساعد المالي (Finance Assistant). هدفك تحليل المصروفات، تقديم ملخصات الميزانية، ومراجعة الفواتير.",
            "data analyst": "أنت محلل بيانات. يمكنك الاستعانة بقاعدة المعرفة للاستعلام عن البيانات.",
            "supervisor": "أنت المايسترو (Supervisor Agent). أنت تدير جميع الأقسام (HR, CRM, Tasks) وتستطيع تنفيذ مهام متقاطعة باستخدام الأدوات المتاحة لك.",
            "general": "أنت مساعد ذكي لمنصة Septimus OS."
        }
        
        sp = req.system_prompt if req.system_prompt else sys_prompts.get(req.agent_type.lower(), sys_prompts["general"])
        
        hr_policy_text = ""
        if req.agent_type.lower() == "hr":
            try:
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    async with session.get(f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=hr_policy") as resp:
                        if resp.status == 200:
                            p_data = await resp.json()
                            if p_data and p_data.get("data"):
                                hr_policy_text = f"\nسياسات الموارد البشرية الحالية (HR Policies): {json.dumps(p_data['data'], ensure_ascii=False)}"
            except Exception as e:
                print(f"Failed to fetch HR policy: {e}")

        system_message = f"{sp}\nContext: {json.dumps(req.context, ensure_ascii=False)}\n{hr_policy_text}\n\nيجب عليك الرد باللغة العربية. فكر (Reason) قبل الإجابة واستخدم الأدوات المتاحة متى دعت الحاجة."
        
        memory = MemorySaver()
        agent = create_react_agent(llm, tools=tools, checkpointer=memory, state_modifier=system_message)
        
        config = {"configurable": {"thread_id": req.thread_id}}
        inputs = {"messages": [("user", req.message)]}
        
        final_reply = ""
        async for event in agent.astream(inputs, config, stream_mode="values"):
            message = event["messages"][-1]
            if type(message).__name__ == "AIMessage" and not getattr(message, "tool_calls", None):
                final_reply = message.content

        return {"reply": final_reply}
    except Exception as e:
        print(f"Chat error: {e}")
        return {"reply": f"حدث خطأ أثناء معالجة طلبك: {str(e)}"}

@app.post("/api/v1/ai/plan-sprint")
async def plan_sprint(req: SprintPlanRequest):
    workspace_id = os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")
    llm = await get_active_llm(workspace_id)
    if not llm:
        # Fallback algorithm
        sorted_tasks = sorted(req.backlog, key=lambda x: (-x.get('Priority', 0), x.get('StoryPoints', 0)))
        selected = []
        cap = req.capacity
        for t in sorted_tasks:
            pts = t.get('StoryPoints') or 0
            if cap >= pts:
                selected.append(t['ID'])
                cap -= pts
        return {"selected_task_ids": selected}

    prompt = f"""
    You are an AI Agile Coach. Analyze the following backlog of tasks and select a subset of tasks to include in the next sprint.
    The sprint has a maximum capacity of {req.capacity} story points.
    Prioritize high-priority tasks. Do not exceed the capacity limit.
    Return ONLY a valid JSON object with the key 'selected_task_ids' containing a list of strings (the IDs of the selected tasks).
    
    Backlog Tasks:
    {json.dumps(req.backlog)}
    """
    
    try:
        res = await llm.ainvoke([HumanMessage(content=prompt)])
        content = res.content.strip()
        if content.startswith("```json"):
            content = content[7:-3]
        parsed = json.loads(content)
        return parsed
    except Exception as e:
        print(f"Error parsing AI response for plan-sprint: {e}")
        return {"selected_task_ids": []}

class GenerateSubtasksRequest(BaseModel):
    title: str
    description: str

@app.post("/api/v1/ai/generate-subtasks")
async def generate_subtasks(req: GenerateSubtasksRequest):
    workspace_id = os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")
    llm = await get_active_llm(workspace_id)
    if not llm:
        return {"subtasks": [
            f"Architecture breakdown for: {req.title}",
            "Database models and API design",
            "Frontend UI components",
            "Automated test coverage"
        ]}
        
    prompt = f"""
    Break down the following task into 3-5 concrete, actionable subtasks.
    Return ONLY a valid JSON object with the key 'subtasks' containing a list of strings (the subtask titles).
    
    Task Title: {req.title}
    Task Description: {req.description}
    """
    
    try:
        res = await llm.ainvoke([HumanMessage(content=prompt)])
        content = res.content.strip()
        if content.startswith("```json"):
            content = content[7:-3]
        parsed = json.loads(content)
        return parsed
    except Exception as e:
        print(f"Error parsing AI response for generate-subtasks: {e}")
        return {"subtasks": []}

if __name__ == '__main__':
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
