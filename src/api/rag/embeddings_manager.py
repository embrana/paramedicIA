"""
Módulo para manejar la generación, almacenamiento y recuperación de embeddings.
"""
import os
import json
import faiss
import numpy as np
import hashlib
from typing import List, Dict, Any, Optional, Tuple
from openai import OpenAI
import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Configuración de la API key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "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")
MODEL_NAME = "text-embedding-3-small"

# Configuración de directorios
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
INDEX_PATH = os.path.join(DATA_DIR, "faiss_index.bin")
METADATA_PATH = os.path.join(DATA_DIR, "metadata.json")

# Cliente OpenAI
client = OpenAI(api_key=OPENAI_API_KEY)

class EmbeddingsManager:
    """
    Clase para gestionar embeddings y su almacenamiento
    """
    def __init__(self):
        """
        Inicializa el gestor de embeddings
        """
        # Crear el directorio de datos si no existe
        os.makedirs(DATA_DIR, exist_ok=True)
        
        # Inicializar o cargar el índice FAISS
        self.dimension = 1536  # Dimensión para text-embedding-3-small
        self.initialize_index()
        
        # Metadata para almacenar información sobre los documentos
        self.metadata = self.load_metadata()
        
        # Divisor de texto
        self.text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            chunk_size=500,
            chunk_overlap=50
        )

    def initialize_index(self):
        """
        Inicializa o carga el índice FAISS
        """
        if os.path.exists(INDEX_PATH):
            print(f"Cargando índice FAISS desde {INDEX_PATH}")
            self.index = faiss.read_index(INDEX_PATH)
        else:
            print(f"Creando nuevo índice FAISS en {INDEX_PATH}")
            self.index = faiss.IndexFlatL2(self.dimension)
            # Guardar índice vacío
            faiss.write_index(self.index, INDEX_PATH)
    
    def load_metadata(self) -> Dict[str, Any]:
        """
        Carga los metadatos de los documentos
        """
        if os.path.exists(METADATA_PATH):
            with open(METADATA_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {"documents": [], "chunk_to_doc": {}}
    
    def save_metadata(self):
        """
        Guarda los metadatos de los documentos
        """
        with open(METADATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(self.metadata, f, ensure_ascii=False, indent=2)
    
    def get_embedding(self, text: str) -> List[float]:
        """
        Genera un embedding para el texto proporcionado
        """
        response = client.embeddings.create(
            model=MODEL_NAME,
            input=[text]
        )
        embedding = response.data[0].embedding
        return embedding
    
    def process_json_file(self, json_data: Dict[str, Any]) -> str:
        """
        Procesa un archivo JSON para generar y almacenar embeddings
        
        Args:
            json_data: Datos JSON a procesar
            
        Returns:
            str: ID del documento procesado
        """
        # Verificar formato del JSON
        if not isinstance(json_data, dict):
            raise ValueError("El JSON debe ser un objeto")
        
        if "title" not in json_data or "content" not in json_data:
            raise ValueError("El JSON debe contener campos 'title' y 'content'")
        
        title = json_data["title"]
        content = json_data["content"]
        source = json_data.get("source", "Desconocido")
        
        # Generar ID único para el documento
        doc_id = hashlib.md5(f"{title}_{source}".encode('utf-8')).hexdigest()
        
        # Comprobar si ya existe
        for doc in self.metadata["documents"]:
            if doc["id"] == doc_id:
                print(f"El documento '{title}' ya existe en la base de datos")
                return doc_id
        
        # Dividir el contenido en chunks
        chunks = self.text_splitter.split_text(content)
        
        # Lista para almacenar los embeddings
        embeddings = []
        chunk_ids = []
        
        # Generar embeddings para cada chunk
        print(f"Generando embeddings para {len(chunks)} chunks...")
        for i, chunk in enumerate(chunks):
            # Generar ID único para el chunk
            chunk_id = f"{doc_id}_chunk_{i}"
            
            # Generar embedding
            embedding = self.get_embedding(chunk)
            
            # Agregar a la lista
            embeddings.append(embedding)
            chunk_ids.append(chunk_id)
            
            # Agregar al mapeo de chunk a documento
            self.metadata["chunk_to_doc"][chunk_id] = {
                "doc_id": doc_id,
                "chunk_index": i,
                "text": chunk
            }
        
        # Convertir lista de embeddings a matriz numpy
        embeddings_array = np.array(embeddings, dtype=np.float32)
        
        # Agregar embeddings al índice
        self.index.add(embeddings_array)
        
        # Guardar el índice
        faiss.write_index(self.index, INDEX_PATH)
        
        # Agregar información del documento
        self.metadata["documents"].append({
            "id": doc_id,
            "title": title,
            "source": source,
            "chunk_count": len(chunks),
            "chunk_ids": chunk_ids
        })
        
        # Guardar metadatos
        self.save_metadata()
        
        print(f"Documento '{title}' procesado con éxito, ID: {doc_id}")
        return doc_id
    
    def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Busca los documentos más similares a la consulta
        
        Args:
            query: Texto de la consulta
            top_k: Número de resultados a devolver
            
        Returns:
            List[Dict[str, Any]]: Lista de chunks relevantes con sus metadatos
        """
        # Verificar que el índice no esté vacío
        if self.index.ntotal == 0:
            return []
        
        # Generar embedding para la consulta
        query_embedding = self.get_embedding(query)
        
        # Convertir a matriz numpy
        query_np = np.array([query_embedding], dtype=np.float32)
        
        # Buscar en el índice
        distances, indices = self.index.search(query_np, min(top_k, self.index.ntotal))
        
        # Obtener resultados
        results = []
        for i, idx in enumerate(indices[0]):
            if idx == -1:  # En caso de que no haya suficientes resultados
                continue
                
            # Obtener chunk_id correspondiente a este índice
            chunk_id = list(self.metadata["chunk_to_doc"].keys())[idx]
            chunk_info = self.metadata["chunk_to_doc"][chunk_id]
            
            # Obtener información del documento
            doc_id = chunk_info["doc_id"]
            doc_info = next((doc for doc in self.metadata["documents"] if doc["id"] == doc_id), None)
            
            if doc_info:
                results.append({
                    "chunk_id": chunk_id,
                    "text": chunk_info["text"],
                    "distance": float(distances[0][i]),
                    "document": {
                        "id": doc_id,
                        "title": doc_info["title"],
                        "source": doc_info["source"]
                    }
                })
        
        return results
    
    def get_document_count(self) -> int:
        """
        Devuelve el número de documentos en la base de datos
        """
        return len(self.metadata["documents"])
    
    def get_chunk_count(self) -> int:
        """
        Devuelve el número total de chunks en la base de datos
        """
        return self.index.ntotal
    
    def get_document_titles(self) -> List[str]:
        """
        Devuelve la lista de títulos de documentos
        """
        return [doc["title"] for doc in self.metadata["documents"]]

# Instancia singleton
embeddings_manager = EmbeddingsManager()