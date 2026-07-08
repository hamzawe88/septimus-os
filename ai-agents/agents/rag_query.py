"""
Septimus OS — RAG Query Engine
يدعم OpenAI GPT / Google Gemini / HuggingFace كـ Fallback تلقائي
"""
import os
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

CHROMA_DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_db")

# ─── LLM Factory ─────────────────────────────────────────────────────────────

def _create_llm():
    """
    يختار أفضل LLM متاح بناءً على متغيرات البيئة.
    الأولوية: OpenAI → Google Gemini → HuggingFace Local
    """
    # 1. OpenAI
    if os.getenv("OPENAI_API_KEY"):
        try:
            from langchain_openai import ChatOpenAI
            print("[RAG Query] Using OpenAI GPT-3.5-turbo")
            return ChatOpenAI(model="gpt-3.5-turbo", temperature=0)
        except ImportError:
            print("[RAG Query] ⚠️ langchain_openai not installed")

    # 2. Google Gemini (free tier available!)
    if os.getenv("GOOGLE_API_KEY"):
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            print("[RAG Query] Using Google Gemini 1.5 Flash (free tier)")
            return ChatGoogleGenerativeAI(
                model="gemini-1.5-flash",
                temperature=0,
                google_api_key=os.getenv("GOOGLE_API_KEY"),
            )
        except ImportError:
            print("[RAG Query] ⚠️ langchain_google_genai not installed")

    # 3. HuggingFace local (no API key needed, but slower)
    print("[RAG Query] ⚠️ No cloud LLM found — using local HuggingFace model")
    print("[RAG Query]    Set OPENAI_API_KEY or GOOGLE_API_KEY in .env for better results")
    return None  # Will be handled gracefully in ask()


# ─── RAG Prompt ──────────────────────────────────────────────────────────────

RAG_PROMPT = ChatPromptTemplate.from_template(
    """أنت مساعد ذكي ونظام تشغيل يُدعى Septimus OS.
أجب عن سؤال المستخدم بناءً على السياق (المستندات) التالية فقط.
إذا لم تجد الإجابة في السياق، قل: "لا أجد هذه المعلومات في المستندات المرفقة."
لا تقم بتأليف إجابة من خارج السياق.

السياق:
{context}

السؤال:
{question}

الإجابة:"""
)


# ─── RAG Query Engine ─────────────────────────────────────────────────────────

class RAGQueryEngine:
    def __init__(self):
        print("[RAG Query] Initializing embeddings...")
        self.embeddings = HuggingFaceEmbeddings(
            model_name="all-MiniLM-L6-v2",
            model_kwargs={"device": "cpu"},
        )
        self.vector_store = Chroma(
            collection_name="documents",
            embedding_function=self.embeddings,
            persist_directory=CHROMA_DB_DIR,
        )
        self.llm = _create_llm()
        print("[RAG Query] ✅ RAG Query Engine ready")

    def ask(self, question: str, entity_id: str = None) -> str:
        """
        Retrieves context from ChromaDB and answers the question.
        If `entity_id` is provided, only searches chunks from that document.
        """
        # Build retriever with optional document filter
        search_kwargs = {"k": 4}
        if entity_id:
            search_kwargs["filter"] = {"entity_id": entity_id}

        retriever = self.vector_store.as_retriever(search_kwargs=search_kwargs)

        def format_docs(docs):
            if not docs:
                return "لا توجد مستندات مرتبطة بهذا السؤال في قاعدة البيانات."
            return "\n\n---\n\n".join(doc.page_content for doc in docs)

        if self.llm:
            # Full RAG chain with LLM
            rag_chain = (
                {"context": retriever | format_docs, "question": RunnablePassthrough()}
                | RAG_PROMPT
                | self.llm
                | StrOutputParser()
            )
            try:
                answer = rag_chain.invoke(question)
                return answer
            except Exception as e:
                print(f"[RAG Query] LLM chain error: {e}")
                # Fall through to retrieval-only mode

        # Fallback: return retrieved chunks without LLM generation
        try:
            docs = retriever.invoke(question)
            if not docs:
                return "⚠️ لم أجد مستندات مرتبطة. يرجى رفع مستند أولاً ثم اسأل."
            context = format_docs(docs)
            return (
                f"⚠️ **ملاحظة**: لا يوجد LLM متاح حالياً. هذا هو النص الأكثر صلة من المستندات:\n\n"
                f"---\n{context}\n---\n\n"
                f"لتفعيل الإجابات الذكية، أضف `OPENAI_API_KEY` أو `GOOGLE_API_KEY` في ملف `.env`"
            )
        except Exception as e:
            return f"عذراً، حدث خطأ أثناء البحث في المستندات: {e}"

    def get_document_count(self, entity_id: str = None) -> int:
        """Returns the number of chunks stored for a given entity."""
        try:
            kwargs = {}
            if entity_id:
                kwargs["where"] = {"entity_id": entity_id}
            result = self.vector_store.get(**kwargs)
            return len(result.get("ids", []))
        except Exception:
            return 0
