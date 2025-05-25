"""
This module takes care of starting the API Server, Loading the DB and Adding the endpoints
"""
import os
import uuid
from flask import Flask, request, jsonify, url_for, Blueprint
from api.models import db, User
from api.utils import generate_sitemap, APIException
from flask_cors import CORS
from openai import OpenAI
from api.rag import embeddings_manager
from api.rag.routes import rag_api
from api.conversation_manager import get_conversation, save_conversation, generate_session_id

api = Blueprint('api', __name__)

# Allow CORS requests to this API
CORS(api)

# Initialize OpenAI client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "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")

print(f"Initializing OpenAI client with API key: {OPENAI_API_KEY[:6]}...{OPENAI_API_KEY[-4:]}")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# Registrar las rutas del sistema RAG
api.register_blueprint(rag_api, url_prefix='/rag')


@api.route('/hello', methods=['POST', 'GET'])
def handle_hello():

    response_body = {
        "message": "Hello! I'm a message that came from the backend, check the network tab on the google inspector and you will see the GET request"
    }

    return jsonify(response_body), 200


@api.route('/chat', methods=['POST'])
def handle_chat():
    data = request.json
    
    if not data or not data.get('message'):
        return jsonify({"error": "No message provided"}), 400
    
    user_message = data.get('message')
    session_id = data.get('session_id', generate_session_id())
    
    try:
        print(f"Procesando mensaje para sesión: {session_id}")
        print(f"Mensaje del usuario: {user_message}")
        print(f"API Key utilizada: {openai_client.api_key[:6]}...{openai_client.api_key[-4:]}")
        
        # Recuperar o crear historial de conversación
        conversation = get_conversation(session_id)
        
        # Añadir mensaje del usuario al historial
        conversation['messages'].append({
            "role": "user",
            "content": user_message
        })
        
        # Buscar contexto relevante en la base de datos RAG
        relevant_context = ""
        try:
            if embeddings_manager.get_chunk_count() > 0:
                print(f"Buscando contexto relevante para: {user_message}")
                search_results = embeddings_manager.search(user_message, top_k=3)
                
                if search_results:
                    relevant_context = "Información relevante de nuestra base de conocimiento médico:\n\n"
                    for i, result in enumerate(search_results):
                        relevant_context += f"DOCUMENTO {i+1}: {result['document']['title']}\n"
                        relevant_context += f"FUENTE: {result['document']['source']}\n"
                        relevant_context += f"CONTENIDO: {result['text']}\n\n"
                    print(f"Se encontraron {len(search_results)} fragmentos relevantes")
                else:
                    print("No se encontró contexto relevante en la base RAG")
            else:
                print("La base de datos RAG está vacía")
        except Exception as rag_error:
            print(f"Error al buscar en la base RAG: {str(rag_error)}")
            # No bloqueamos la ejecución, simplemente continuamos sin contexto RAG
        
        # Si tenemos contexto relevante y el primer mensaje es system, lo actualizamos
        if relevant_context and conversation['messages'][0]['role'] == 'system':
            system_content = conversation['messages'][0]['content']
            conversation['messages'][0]['content'] = f"{system_content}\n\n{relevant_context}\n\nIMPORTANTE: Utiliza específicamente la información proporcionada en los documentos anteriores para responder a la consulta del usuario. Cita la fuente de la información. Si la información no es suficiente para responder completamente, indica qué información falta y sugiere consultar con un supervisor."
        
        # Construir el array de mensajes para OpenAI
        messages = conversation['messages'].copy()
        
        # Enviar todos los mensajes a OpenAI
        print(f"Enviando {len(messages)} mensajes a OpenAI")
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            temperature=0.2,
            max_tokens=1000
        )
        
        # Extraer respuesta del asistente
        ai_response = response.choices[0].message.content
        print(f"Respuesta recibida de OpenAI: {ai_response[:100]}...")
        
        # Añadir respuesta al historial
        conversation['messages'].append({
            "role": "assistant",
            "content": ai_response
        })
        
        # Guardar conversación actualizada
        save_conversation(session_id, conversation)
        
        return jsonify({
            "response": ai_response,
            "session_id": session_id,
            "rag_used": relevant_context != ""
        }), 200
        
    except Exception as e:
        error_message = str(e)
        print(f"Error calling OpenAI API: {error_message}")
        
        # More detailed logging
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({
            "error": "Failed to get response from AI service", 
            "details": error_message
        }), 500
