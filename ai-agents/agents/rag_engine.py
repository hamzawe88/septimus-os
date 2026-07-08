import os
from pathlib import Path
from langchain_community.document_loaders import PyMuPDFLoader, TextLoader, Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

CHROMA_DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_db")

class DocumentProcessor:
    def __init__(self):
        # We use a fast, local embedding model
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        self.vector_store = Chroma(
            collection_name="documents",
            embedding_function=self.embeddings,
            persist_directory=CHROMA_DB_DIR
        )

    def process_file(self, file_path: str, metadata: dict) -> bool:
        """
        Reads a file, chunks it, and adds to ChromaDB.
        `metadata` should include 'entity_id', 'name', 'uploader_id', etc.
        """
        print(f"[RAG Engine] Processing file: {file_path}")
        
        if not os.path.exists(file_path):
            print(f"[RAG Engine] Error: File not found {file_path}")
            return False

        ext = Path(file_path).suffix.lower()
        loader = None

        if ext == ".pdf":
            loader = PyMuPDFLoader(file_path)
        elif ext in [".txt", ".md"]:
            loader = TextLoader(file_path, encoding='utf-8')
        elif ext == ".docx":
            loader = Docx2txtLoader(file_path)
        else:
            print(f"[RAG Engine] Unsupported file extension: {ext}")
            return False

        try:
            documents = loader.load()
            
            # Inject metadata into every document
            for doc in documents:
                doc.metadata.update(metadata)

            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=150,
                add_start_index=True,
            )
            
            chunks = text_splitter.split_documents(documents)
            print(f"[RAG Engine] Generated {len(chunks)} chunks from {file_path}")
            
            # Store in Chroma
            self.vector_store.add_documents(chunks)
            print(f"[RAG Engine] Successfully added to Vector DB for entity {metadata.get('entity_id')}")
            return True
            
        except Exception as e:
            print(f"[RAG Engine] Error processing document: {e}")
            return False
