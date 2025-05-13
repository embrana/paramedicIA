"""
Rutas API para el sistema RAG
"""
from flask import Blueprint, request, jsonify
import json
import os
from .embeddings_manager import embeddings_manager

rag_api = Blueprint('rag_api', __name__)

@rag_api.route('/upload', methods=['POST'])
def upload_document():
    """
    Endpoint para subir un archivo JSON y procesarlo
    """
    try:
        # Comprobar si hay un archivo en la petición
        if 'file' not in request.files:
            return jsonify({"error": "No se proporcionó ningún archivo"}), 400
        
        file = request.files['file']
        
        # Comprobar si el nombre del archivo está vacío
        if file.filename == '':
            return jsonify({"error": "Nombre de archivo vacío"}), 400
        
        # Comprobar si es un JSON
        if not file.filename.lower().endswith('.json'):
            return jsonify({"error": "Solo se permiten archivos JSON"}), 400
        
        # Leer el contenido JSON
        try:
            json_data = json.loads(file.read().decode('utf-8'))
        except json.JSONDecodeError:
            return jsonify({"error": "El archivo no contiene JSON válido"}), 400
        
        # Procesar el archivo
        doc_id = embeddings_manager.process_json_file(json_data)
        
        return jsonify({
            "message": "Documento procesado correctamente",
            "document_id": doc_id
        }), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@rag_api.route('/stats', methods=['GET'])
def get_stats():
    """
    Endpoint para obtener estadísticas sobre la base de datos RAG
    """
    try:
        return jsonify({
            "document_count": embeddings_manager.get_document_count(),
            "chunk_count": embeddings_manager.get_chunk_count(),
            "documents": embeddings_manager.get_document_titles()
        }), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@rag_api.route('/search', methods=['POST'])
def search():
    """
    Endpoint para buscar en la base de datos RAG
    """
    try:
        data = request.json
        
        if not data or not data.get('query'):
            return jsonify({"error": "No se proporcionó ninguna consulta"}), 400
        
        query = data.get('query')
        top_k = data.get('top_k', 5)
        
        results = embeddings_manager.search(query, top_k)
        
        return jsonify({
            "query": query,
            "results": results
        }), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500