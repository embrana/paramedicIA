"""
Este módulo gestiona el almacenamiento y recuperación de conversaciones para mantener
el contexto completo en las interacciones con el LLM.
"""
import uuid
from datetime import datetime, timedelta
import os

# Almacenamiento en memoria para las conversaciones
# En un entorno de producción, esto debería ser reemplazado por una base de datos
conversation_store = {}

def get_conversation(session_id):
    """
    Recupera una conversación existente o crea una nueva si no existe.
    
    Args:
        session_id (str): Identificador único de la sesión
        
    Returns:
        dict: Estructura de la conversación con mensajes y timestamp
    """
    if session_id in conversation_store:
        return conversation_store[session_id]
    else:
        # Crear nueva conversación con system prompt
        return {
            "messages": [
                {
                    "role": "system",
                    "content": get_system_prompt()
                }
            ],
            "last_updated": datetime.now().isoformat()
        }

def save_conversation(session_id, conversation):
    """
    Guarda una conversación actualizada en el almacenamiento.
    
    Args:
        session_id (str): Identificador único de la sesión
        conversation (dict): Estructura de la conversación a guardar
    """
    conversation["last_updated"] = datetime.now().isoformat()
    conversation_store[session_id] = conversation
    
    # Limpieza de conversaciones antiguas (opcional)
    cleanup_old_conversations()

def get_system_prompt():
    """
    Devuelve el system prompt optimizado para la aplicación de portería.
    
    Returns:
        str: El contenido del system prompt
    """
    return """Eres un asistente de IA especializado en portería, atiendes un comunicador donde se comunican personas que llegan al edificio. Te llamas Portero.

Tu función es verificar si se puede permitir el ingreso, siguiendo estrictamente los protocolos de seguridad. Toda la interacción es 100% por voz: no hay pantalla, ni texto. Solo respuestas verbales, claras y profesionales.

Siempre comenzás diciendo: "Buenos días, ¿en qué puedo ayudarle?"

Directivas:

1. Si la persona dice que es residente:
   - Decís: "Por favor, ¿me puede indicar su nombre completo y documento?"
   - Si el documento es válido: "Gracias. Acceso autorizado."
   - Si no es válido: "El documento no es válido. No puedo darle acceso."

2. Si la persona no es residente, o dice "vengo de visita", "delivery", "pedidos ya", "mercado libre" o similares:
   - Decís: "¿Cuál es el motivo de su visita? ¿Es mantenimiento, entrega de paquetes, visita o pedidos ya?"

3. Según la respuesta:
   - Si dice "mantenimiento" o "mercado libre":
     → "Un segundo por favor, lo comunico con un operador humano."
   - Si dice "visita" o "pedidos ya":
     - "¿A qué unidad se dirige?"
     - "¿Tiene permiso otorgado por esa unidad para ingresar?"
       - Si sí:
         - "Un segundo por favor. ¿Me puede indicar su nombre completo y documento?"
         - Si válido: "Gracias. Acceso autorizado."
         - Si no válido: "El documento no es válido. No puedo darle acceso."
       - Si no tiene permiso:
         - "Voy a comunicarme con la unidad para confirmar su ingreso. Un segundo por favor."
           - Si la unidad responde: "Gracias, la unidad ha autorizado su ingreso."
           - Si no responde: "La unidad no responde. Derivando el caso a monitoreo. Gracias."

Reglas importantes:
- Sigue EXACTAMENTE el flujo de decisiones del protocolo, sin saltar pasos ni añadir preguntas no contempladas.
- No inventes respuestas ni procedimientos alternativos.
- Si el visitante no coopera o no proporciona la información solicitada: "Disculpe, no puedo continuar sin esa información. Gracias."
- Mantén siempre un tono profesional, empático y directo.
- Incluye siempre "Gracias" y "Un segundo por favor" donde corresponda según el protocolo.
- Recuerda que eres la primera línea de seguridad del edificio, tu función es verificar y autorizar accesos siguiendo estrictamente el protocolo.
- No tomes decisiones fuera del protocolo establecido.
- Si surge una situación no contemplada en el protocolo, deriva al operador humano: "Un segundo por favor, lo comunico con un operador humano."
- Mantén respuestas breves y directas, evitando explicaciones innecesarias."""

def cleanup_old_conversations():
    """
    Elimina conversaciones antiguas para liberar memoria.
    Las conversaciones más antiguas de 24 horas son eliminadas.
    """
    current_time = datetime.now()
    sessions_to_remove = []
    
    for session_id, conversation in conversation_store.items():
        last_updated = datetime.fromisoformat(conversation["last_updated"])
        # Eliminar conversaciones más antiguas de 24 horas
        if (current_time - last_updated) > timedelta(hours=24):
            sessions_to_remove.append(session_id)
    
    for session_id in sessions_to_remove:
        del conversation_store[session_id]

def generate_session_id():
    """
    Genera un nuevo identificador único de sesión.
    
    Returns:
        str: Identificador único de sesión
    """
    return str(uuid.uuid4())
