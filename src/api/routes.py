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
        
        # Construcción del sistema de mensaje para emergencias médicas
        system_message = """Eres un asistente de IA especializado en soporte a operadores médicos de campo para emergencias. Tu función es responder consultas con precisión, usando una base de datos RAG con manuales de emergencia, protocolos médicos y guías actualizadas.

Directivas:
Precisión: Extrae información únicamente de la base RAG. Si no hay datos relevantes, indica que se consulte a un supervisor médico. Siempre entrega los pasos de la base de RAG exactos sin modificaciones además asegúrate que siempre indicas que llame al 911.
Contexto de emergencia: Usa lenguaje claro, conciso y profesional, optimizado para entornos de alta presión.
Estructura: Presenta respuestas en pasos numerados o listas cuando sea aplicable.
Seguridad: Prioriza protocolos que protejan al paciente. Advierte sobre procedimientos de alto riesgo que requieran supervisión.
Limitaciones: No diagnostiques ni decidas clínicamente. Limítate a información de apoyo. Indica si la consulta excede el alcance de la base RAG.
Tono: Profesional, empático, directo.
Consulta RAG: Busca datos actuales y relevantes en la base. Selecciona la fuente alineada con protocolos médicos estándar.

Ejemplo:
Consulta: "Pasos RCP adulto."
Respuesta: Per manuales RAG:
1. Verificar seguridad.
2. Confirmar inconsciencia y ausencia de respiración normal.
3. Llamar emergencia (911).
4. Compresiones torácicas: 100-120/min, 5-6 cm profundidad, centro pecho.
5. Ventilaciones (si capacitado): 2 cada 30 compresiones.
Nota: Continuar hasta llegada de ayuda o respuesta del paciente."""
        
        # Si tenemos contexto relevante, lo agregamos al mensaje del sistema
        if relevant_context:
            system_message += f"\n\n{relevant_context}"
            
            # Y pedimos específicamente que use la información RAG
            system_message += "\n\nIMPORTANTE: Utiliza específicamente la información proporcionada en los documentos anteriores para responder a la consulta del usuario. Cita la fuente de la información. Si la información no es suficiente para responder completamente, indica qué información falta y sugiere consultar con un supervisor médico."
            
        # Send message to OpenAI API
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
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

@api.route('/realtime-chat', methods=['POST'])
def handle_realtime_chat():
    data = request.json
    
    if not data or not data.get('message'):
        return jsonify({"error": "No message provided"}), 400
    
    user_message = data.get('message')
    
    try:
        print(f"Processing real-time message: {user_message}")
        
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
        
        # Construcción del sistema de mensaje para emergencias médicas con RAG
        system_message = """Eres un asistente de IA especializado en soporte a operadores médicos de campo para emergencias. Tu función es responder consultas con precisión, usando una base de datos RAG con manuales de emergencia, protocolos médicos y guías actualizadas.

Directivas:
Precisión: Extrae información únicamente de la base RAG. Si no hay datos relevantes, indica que se consulte a un supervisor médico. Siempre entrega los pasos de la base de RAG exactos sin modificaciones además asegúrate que siempre indicas que llame al 911.
Contexto de emergencia: Usa lenguaje claro, conciso y profesional, optimizado para entornos de alta presión.
Estructura: Presenta respuestas en pasos numerados o listas cuando sea aplicable.
Seguridad: Prioriza protocolos que protejan al paciente. Advierte sobre procedimientos de alto riesgo que requieran supervisión.
Limitaciones: No diagnostiques ni decidas clínicamente. Limítate a información de apoyo. Indica si la consulta excede el alcance de la base RAG.
Tono: Profesional, empático, directo.
Consulta RAG: Busca datos actuales y relevantes en la base. Selecciona la fuente alineada con protocolos médicos estándar.

Ejemplo:
Consulta: "Pasos RCP adulto."
Respuesta: Per manuales RAG:
1. Verificar seguridad.
2. Confirmar inconsciencia y ausencia de respiración normal.
3. Llamar emergencia (911).
4. Compresiones torácicas: 100-120/min, 5-6 cm profundidad, centro pecho.
5. Ventilaciones (si capacitado): 2 cada 30 compresiones.
Nota: Continuar hasta llegada de ayuda o respuesta del paciente."""
        
        # Si tenemos contexto relevante, lo agregamos al mensaje del sistema
        if relevant_context:
            system_message += f"\n\n{relevant_context}"
            
            # Y pedimos específicamente que use la información RAG
            system_message += "\n\nIMPORTANTE: Utiliza específicamente la información proporcionada en los documentos anteriores para responder a la consulta del usuario. Cita la fuente de la información. Si la información no es suficiente para responder completamente, indica qué información falta y sugiere consultar con un supervisor médico."
        
# ////
       # system_message = "Eres un asistente de IA especializado en porteria, atiendes un comunicador donde se comunican personas que llegan al edificio, te llamas portero. Tu función es responder consultas con precisió.\nDirectivas:\nContexto: Usa lenguaje claro, conciso y profesional, optimizado para entornos de alta presión.\nEstructura: Presenta respuestas claras y siempre di gracias y un segundo por favor\nTono: Profesional, empático, directo."
#         system_message = """Eres un asistente de IA especializado en portería, atiendes un comunicador donde se comunican personas que llegan al edificio, te llamas Portero. Tu función es responder consultas con precisión.

# Directivas:
# Contexto: Toda la interacción es por voz, no hay pantalla. Atiendes a personas que llegan al edificio y tocan el portero. Siempre comenzás diciendo: 'Buenos días, ¿en qué puedo ayudarle?'. Luego guías la conversación verbalmente, siguiendo protocolos de seguridad.

# DETECCIÓN DE TIPOS DE SERVICIO - Escucha estas variaciones:
# - PEDIDOS YA: "pedidos ya", "pedidosya", "delivery", "comida", "pedido", "delivery de comida", "traigo comida", "soy delivery"
# - MANTENIMIENTO: "mantenimiento", "técnico", "reparación", "arreglo", "plomero", "electricista", "soy técnico", "vengo a reparar"
# - VISITA: "visita", "visitante", "amigo", "familiar", "vengo a ver", "voy a visitar", "conozco a alguien"
# - ENTREGA PAQUETES: "entrega", "paquete", "encomienda", "correo", "mercado libre", "amazon", "traigo un paquete", "delivery paquete"

# Estructura:
# - Si la persona dice que es residente: responder 'Por favor, ¿me puede indicar su nombre completo y documento?'
#   - Si el documento es válido: 'Gracias. Acceso autorizado.'
#   - Si el documento no es válido: 'El documento no es válido. No puedo darle acceso.'

# - Si la persona no es residente, responder: '¿Cuál es el motivo de su visita? ¿Es mantenimiento, entrega de paquetes, visita o pedidos ya?'

# FLUJOS POR TIPO DE SERVICIO:

# MANTENIMIENTO o ENTREGA PAQUETES:
# - 'Un segundo por favor, lo comunico con un operador humano.'

# PEDIDOS YA:
# - '¿A qué unidad se dirige?'
# - '¿Tiene permiso otorgado por esa unidad para ingresar?'
#   - Si sí: 'Un segundo por favor. ¿Me puede indicar su nombre completo y documento?'
#     - Si válido: 'Gracias. Acceso autorizado.'
#     - Si no válido: 'El documento no es válido. No puedo darle acceso.'
#   - Si no tiene permiso: 'Voy a comunicarme con la unidad para confirmar su ingreso. Un segundo por favor.'
#     - Si la unidad responde: 'Gracias, la unidad ha autorizado su ingreso.'
#     - Si la unidad no responde: 'La unidad no responde. Derivando el caso a monitoreo. Gracias.'

# VISITA:
# - '¿A qué unidad se dirige?'
# - '¿Tiene permiso otorgado por esa unidad para ingresar?'
#   - Si sí: 'Un segundo por favor. ¿Me puede indicar su nombre completo y documento?'
#     - Si válido: 'Gracias. Acceso autorizado.'
#     - Si no válido: 'El documento no es válido. No puedo darle acceso.'
#   - Si no tiene permiso: 'Voy a comunicarme con la unidad para confirmar su ingreso. Un segundo por favor.'
#     - Si la unidad responde: 'Gracias, la unidad ha autorizado su ingreso.'
#     - Si la unidad no responde: 'La unidad no responde. Derivando el caso a monitoreo. Gracias.'

# Tono:
# Profesional, empático, directo. Siempre responde de forma clara. Incluí "Gracias" y "Un segundo por favor" en cada interacción donde corresponda. Nunca inventes respuestas ni salgas del protocolo. Si el visitante no colabora, decí: 'Disculpe, no puedo continuar sin esa información. Gracias.'"""
        # Using OpenAI text-to-speech API to convert the response to audio
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ],
            temperature=0.2,
            max_tokens=1000
        )
        
        # Extract assistant's response text
        ai_response_text = response.choices[0].message.content
        print(f"Received text response from OpenAI: {ai_response_text[:100]}...")
        print(f"Response length: {len(ai_response_text)} characters")
        
        # Truncate response for TTS if too long (OpenAI TTS has a 4096 character limit)
        tts_text = ai_response_text
        if len(ai_response_text) > 4000:
            # Truncate and add note
            tts_text = ai_response_text[:3900] + "... Consulta la respuesta completa en pantalla."
            print(f"Response truncated for TTS: {len(tts_text)} characters")
        
        # Convert the text response to speech using OpenAI TTS API
        try:
            print("Starting TTS conversion...")
            audio_response = openai_client.audio.speech.create(
                model="tts-1", # Using the standard TTS model
                voice="alloy", # You can choose from "alloy", "echo", "fable", "onyx", "nova", "shimmer"
                input=tts_text
            )
            print("TTS conversion completed successfully")
            
            # Save the audio response as a temporary file
            from tempfile import NamedTemporaryFile
            import base64
            
            with NamedTemporaryFile(delete=False, suffix=".mp3") as temp_file:
                temp_filename = temp_file.name
                # Get the audio content as bytes
                audio_content = audio_response.content
                # Write the audio content to the temp file
                temp_file.write(audio_content)
                print(f"Audio file saved: {len(audio_content)} bytes")
            
            # Read the audio file and encode it as base64
            with open(temp_filename, "rb") as audio_file:
                encoded_audio = base64.b64encode(audio_file.read()).decode("utf-8")
                print(f"Audio encoded to base64: {len(encoded_audio)} characters")
            
            # Delete the temporary file
            import os
            os.unlink(temp_filename)
            
            return jsonify({
                "response": ai_response_text,
                "audio": encoded_audio,
                "rag_used": relevant_context != ""
            }), 200
            
        except Exception as tts_error:
            print(f"Error in TTS conversion: {str(tts_error)}")
            # Return response without audio if TTS fails
            return jsonify({
                "response": ai_response_text,
                "audio": None,
                "rag_used": relevant_context != "",
                "tts_error": str(tts_error)
            }), 200
        
    except Exception as e:
        error_message = str(e)
        print(f"Error processing real-time chat: {error_message}")
        
        # More detailed logging
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({
            "error": "Failed to process real-time request", 
            "details": error_message
        }), 500

@api.route('/voice-chat', methods=['POST'])
def handle_voice_chat():
    data = request.json
    
    if not data or not data.get('message'):
        return jsonify({"error": "No message provided"}), 400
    
    user_message = data.get('message')
    
    try:
        print(f"Processing voice message: {user_message}")
        
        # Similar RAG search as in handle_chat
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
        
        # Construcción del sistema de mensaje
        system_message = "Eres un asistente de IA especializado en soporte a operadores médicos de campo para emergencias. Tu función es responder consultas con precisión, usando una base de datos RAG con manuales de emergencia, protocolos médicos y guías actualizadas.\nDirectivas:\nPrecisión: Extrae información únicamente de la base RAG. Si no hay datos relevantes, indica que se consulte a un supervisor médico. Siempre entrega los pasos de la base de RAG exactos sin modificaciones ademas asegurate que siempre indicas que llame al 911.\nContexto de emergencia: Usa lenguaje claro, conciso y profesional, optimizado para entornos de alta presión.\nEstructura: Presenta respuestas en pasos numerados o listas cuando sea aplicable.\nSeguridad: Prioriza protocolos que protejan al paciente. Advierte sobre procedimientos de alto riesgo que requieran supervisión.\nLimitaciones: No diagnostiques ni decidas clínicamente. Limítate a información de apoyo. Indica si la consulta excede el alcance de la base RAG.\nTono: Profesional, empático, directo.\nConsulta RAG: Busca datos actuales y relevantes en la base. Selecciona la fuente alineada con protocolos médicos estándar."
        
        # Si tenemos contexto relevante, lo agregamos al mensaje del sistema
        if relevant_context:
            system_message += f"\n\n{relevant_context}"
            
            # Y pedimos específicamente que use la información RAG
            system_message += "\n\nIMPORTANTE: Utiliza específicamente la información proporcionada en los documentos anteriores para responder a la consulta del usuario. Cita la fuente de la información. Si la información no es suficiente para responder completamente, indica qué información falta y sugiere consultar con un supervisor médico."
        
        # Using OpenAI text-to-speech API to convert the response to audio
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ],
            temperature=0.2,
            max_tokens=1000
        )
        
        # Extract assistant's response text
        ai_response_text = response.choices[0].message.content
        print(f"Received text response from OpenAI: {ai_response_text[:100]}...")
        
        # Convert the text response to speech using OpenAI TTS API
        audio_response = openai_client.audio.speech.create(
            model="tts-1", # Using the standard TTS model
            voice="alloy", # You can choose from "alloy", "echo", "fable", "onyx", "nova", "shimmer"
            input=ai_response_text
        )
        
        # Save the audio response as a temporary file
        from tempfile import NamedTemporaryFile
        import base64
        
        with NamedTemporaryFile(delete=False, suffix=".mp3") as temp_file:
            temp_filename = temp_file.name
            # Get the audio content as bytes
            audio_content = audio_response.content
            # Write the audio content to the temp file
            temp_file.write(audio_content)
        
        # Read the audio file and encode it as base64
        with open(temp_filename, "rb") as audio_file:
            encoded_audio = base64.b64encode(audio_file.read()).decode('utf-8')
        
        # Delete the temporary file
        import os
        os.unlink(temp_filename)
        
        return jsonify({
            "response": ai_response_text,
            "audio": encoded_audio,
            "rag_used": relevant_context != ""
        }), 200
        
    except Exception as e:
        error_message = str(e)
        print(f"Error processing voice chat: {error_message}")
        
        # More detailed logging
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({
            "error": "Failed to process voice request", 
            "details": error_message
        }), 500
