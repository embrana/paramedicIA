"""
This module takes care of starting the API Server, Loading the DB and Adding the endpoints
"""
import os
from flask import Flask, request, jsonify, url_for, Blueprint
from api.models import db, User
from api.utils import generate_sitemap, APIException
from flask_cors import CORS
from openai import OpenAI
from api.rag import embeddings_manager
from api.rag.routes import rag_api

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
    
    try:
        print(f"Sending message to OpenAI: {user_message}")
        print(f"API Key used: {openai_client.api_key[:6]}...{openai_client.api_key[-4:]}")
        
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
        
        # Construcción del sistema de mensaje
        system_message = "Eres un asistente de IA especializado en soporte a operadores médicos de campo para emergencias. Tu función es responder consultas con precisión, usando una base de datos RAG con manuales de emergencia, protocolos médicos y guías actualizadas.\nDirectivas:\nPrecisión: Extrae información únicamente de la base RAG. Si no hay datos relevantes, indica que se consulte a un supervisor médico. Siempre entrega los pasos de la base de RAG exactos sin modificaciones ademas asegurate que siempre indicas que llame al 911.\nContexto de emergencia: Usa lenguaje claro, conciso y profesional, optimizado para entornos de alta presión.\nEstructura: Presenta respuestas en pasos numerados o listas cuando sea aplicable.\nSeguridad: Prioriza protocolos que protejan al paciente. Advierte sobre procedimientos de alto riesgo que requieran supervisión.\nLimitaciones: No diagnostiques ni decidas clínicamente. Limítate a información de apoyo. Indica si la consulta excede el alcance de la base RAG.\nTono: Profesional, empático, directo.\nConsulta RAG: Busca datos actuales y relevantes en la base. Selecciona la fuente alineada con protocolos médicos estándar.\nEjemplo:\nConsulta: \"Pasos RCP adulto.\"\nRespuesta: Per manuales RAG:\nVerificar seguridad.\nConfirmar inconsciencia y ausencia de respiración normal.\nLlamar emergencia.\nCompresiones torácicas: 100-120/min, 5-6 cm profundidad, centro pecho.\nVentilaciones (si capacitado): 2 cada 30 compresiones.\nNota: Continuar hasta llegada de ayuda o respuesta del paciente."
        
        # Si tenemos contexto relevante, lo agregamos al mensaje del sistema
        if relevant_context:
            system_message += f"\n\n{relevant_context}"
            
            # Y pedimos específicamente que use la información RAG
            system_message += "\n\nIMPORTANTE: Utiliza específicamente la información proporcionada en los documentos anteriores para responder a la consulta del usuario. Cita la fuente de la información. Si la información no es suficiente para responder completamente, indica qué información falta y sugiere consultar con un supervisor médico."
            
        # Send message to OpenAI API
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo", # Usando un modelo más común para probar
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ],
            temperature=0.2,
            max_tokens=1000
        )
        
        # Extract assistant's response
        ai_response = response.choices[0].message.content
        print(f"Received response from OpenAI: {ai_response[:100]}...")
        
        return jsonify({
            "response": ai_response,
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
