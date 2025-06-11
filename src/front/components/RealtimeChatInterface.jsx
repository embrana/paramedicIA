import React, { useState, useRef, useEffect } from "react";

export const RealtimeChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [audioResponse, setAudioResponse] = useState(null);
  const audioRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Scroll to bottom of chat when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  // Reference for speech recognition
  const recognitionRef = useRef(null);
  // For silence detection
  const silenceTimeoutRef = useRef(null);
  const lastSpeechTimestampRef = useRef(0);
  const transcriptRef = useRef('');
  // Para controlar si el reconocimiento está actualmente procesando
  const isProcessingRef = useRef(false);
  
  // Play audio response when available
  useEffect(() => {
    if (audioResponse) {
      // Al recibir una respuesta de audio, pausamos temporalmente el reconocimiento de voz
      // para evitar que el sistema reconozca la propia respuesta
      if (recognitionRef.current && isListening) {
        console.log("Pausando reconocimiento de voz durante reproducción de audio");
        // Marcar como procesando para evitar actualizaciones del input durante la reproducción
        isProcessingRef.current = true;
        // Detener temporalmente el reconocimiento
        try {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        } catch (e) {
          console.log("Error al detener reconocimiento:", e);
        }
      }
      
      console.log("Creating audio element with base64 data");
      const audio = new Audio(`data:audio/mp3;base64,${audioResponse}`);
      audioRef.current = audio;
      
      // Evento para cuando termine la reproducción del audio
      audio.onended = () => {
        console.log("Reproducción de audio finalizada, reactivando reconocimiento");
        // Esperamos un poco más para asegurarnos que el eco del audio ha terminado
        setTimeout(() => {
          // Desmarcar procesando
          isProcessingRef.current = false;
          
          // Reiniciar reconocimiento si estaba activo
          if (isListening && !recognitionRef.current) {
            startRecognition();
          }
        }, 800); // Esperar 800ms adicionales después de que termine el audio
      };
      
      audio.play().catch(error => {
        console.error("Error playing audio:", error);
        // En caso de error, asegurarnos de desmarcar procesando
        isProcessingRef.current = false;
      });
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [audioResponse, isListening]);
  
  // Función para iniciar reconocimiento - extraída para poder reutilizarla
  const startRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta el reconocimiento de voz. Intenta con Chrome, Edge o Safari.");
      return false;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true; // Enable continuous recognition
    recognition.interimResults = true; // Get interim results for more responsive experience
    
    // Reset transcript
    transcriptRef.current = '';
    
    // Handle results from speech recognition
    recognition.onresult = (event) => {
      // Si estamos procesando una respuesta, no actualizar el input
      if (isProcessingRef.current) {
        console.log("Ignorando resultado de reconocimiento durante procesamiento");
        return;
      }
      
      // Update the timestamp of the last speech detection
      lastSpeechTimestampRef.current = Date.now();
      
      // Comprobamos si hay un reconocimiento nuevo
      let isNewRecognition = false;
      
      // Determinar cuál es el último resultado (para evitar repeticiones)
      let latestFinalResult = -1;
      
      for (let i = 0; i < event.results.length; i++) {
        // Si este resultado es final y es más reciente que el anterior encontrado
        if (event.results[i].isFinal && i > latestFinalResult) {
          latestFinalResult = i;
        }
      }
      
      // Si tenemos un nuevo resultado final, usar solo ese
      // (ignorando todos los anteriores para evitar la acumulación)
      if (latestFinalResult >= 0) {
        // Reiniciar el transcript en vez de acumular
        transcriptRef.current = event.results[latestFinalResult][0].transcript.trim();
        isNewRecognition = true;
      }
      
      // Obtener cualquier resultado provisional actual
      let interimTranscript = '';
      
      // Solo procesar resultados provisionales DESPUÉS del último final
      for (let i = Math.max(0, latestFinalResult + 1); i < event.results.length; i++) {
        if (!event.results[i].isFinal) {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      // Update input with current status (either new final result or latest interim)
      if (transcriptRef.current || interimTranscript) {
        setInputMessage((transcriptRef.current ? transcriptRef.current + ' ' : '') + interimTranscript);
      }
      
      // Reset silence detection timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      
      // Set a new timeout to detect silence (1.8 seconds)
      silenceTimeoutRef.current = setTimeout(async () => {
        // If we have something in the transcript, send it
        if (transcriptRef.current.trim()) {
          const messageToSend = transcriptRef.current.trim();
          // Reset transcript for the next utterance
          transcriptRef.current = '';
          
          // Marcar como procesando para evitar que el reconocimiento actualice el input
          isProcessingRef.current = true;
          
          // Limpiar el inputMessage
          setInputMessage('');
          
          // Parar el reconocimiento mientras enviamos el mensaje
          // para evitar capturar el eco de la respuesta
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop();
              recognitionRef.current = null;
            } catch (e) {
              console.log("Error al detener reconocimiento durante envío:", e);
            }
          }
          
          // Send the message
          await sendVoiceMessage(messageToSend);
          
          // El reconocimiento se reiniciará cuando termine la reproducción del audio
        }
      }, 1800); // 1.8 second silence detection
    };
    
    recognition.onerror = (event) => {
      console.error("Error de reconocimiento de voz:", event.error);
      if (event.error !== 'no-speech') {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {}
          recognitionRef.current = null;
        }
        
        if (isListening) {
          // Solo desactivar el flag si no fue un error simple de 'no-speech'
          if (event.error !== 'no-speech') {
            setIsListening(false);
          } else {
            // Si fue un error de no-speech y seguimos escuchando, intentar reiniciar
            setTimeout(() => {
              if (isListening && !recognitionRef.current && !isProcessingRef.current) {
                startRecognition();
              }
            }, 300);
          }
        }
      }
    };
    
    recognition.onend = () => {
      console.log("Reconocimiento finalizado");
      // Limpiamos la referencia
      recognitionRef.current = null;
      
      // Si todavía estamos en modo de escucha y no estamos procesando una respuesta, reiniciar
      // Pero solo si realmente queremos seguir escuchando (isListening es true)
      if (isListening && !isProcessingRef.current) {
        console.log("Reiniciando reconocimiento");
        setTimeout(() => {
          if (isListening && !recognitionRef.current && !isProcessingRef.current) {
            startRecognition();
          }
        }, 300);
      } else {
        console.log("No se reinicia el reconocimiento porque está desactivado o procesando");
      }
    };
    
    // Store recognition in ref for later access
    recognitionRef.current = recognition;
    
    try {
      recognition.start();
      console.log("Reconocimiento iniciado");
      return true;
    } catch (e) {
      console.error("Error al iniciar reconocimiento:", e);
      return false;
    }
  };
  
  // Handle microphone access and continuous voice recognition
  const toggleListening = async () => {
    try {
      if (!isListening) {
        // Activar el flag primero
        setIsListening(true);
        // Limpiar el input
        setInputMessage('');
        
        // Iniciar el reconocimiento después de actualizar el estado
        setTimeout(() => {
          if (!startRecognition()) {
            // Si falló, desactivar el flag
            setIsListening(false);
          }
        }, 100);
      } else {
        // Stop listening
        setIsListening(false);
        
        // Clear any pending silence detection
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        
        // Limpiar el input para evitar que se envíe el último mensaje de OpenAI
        setInputMessage('');
        transcriptRef.current = '';
        
        // Stop recognition if it's active
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
            recognitionRef.current = null;
          } catch (e) {
            console.log("Error al detener reconocimiento:", e);
          }
        }
        
        // Marcar como procesando para evitar actualizaciones del input
        isProcessingRef.current = true;
        
        // Ya no enviamos mensajes pendientes al finalizar, para evitar capturar respuestas
      }
    } catch (error) {
      console.error("Error al acceder al micrófono:", error);
      setIsListening(false);
      alert("No se pudo acceder al micrófono. Verifica los permisos de tu navegador.");
    }
  };
  
  // Process voice message with backend voice API - without RAG for real-time focus
  const sendVoiceMessage = async (message) => {
    if (!message.trim()) return;
    
    // Add user message to chat
    const userMessage = {
      text: message,
      sender: "user",
      timestamp: new Date().toISOString()
    };
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      
      if (!backendUrl) throw new Error("VITE_BACKEND_URL is not defined in .env file");
      
      console.log(`Sending real-time voice request to ${backendUrl}/api/realtime-chat with message: ${message}`);
      
      const response = await fetch(`${backendUrl}/api/realtime-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: message }),
      });
      
      const data = await response.json();
      console.log("Response received:", data);
      
      if (!response.ok) {
        console.error("Error response:", data);
        throw new Error(data.error || "Error communicating with API" + (data.details ? `: ${data.details}` : ""));
      }
      
      // Set audio response to trigger playback
      if (data.audio) {
        console.log("Setting audio response, length:", data.audio.length);
        setAudioResponse(data.audio);
      } else {
        console.warn("No audio data received from API");
        if (data.tts_error) {
          console.error("TTS Error:", data.tts_error);
        }
      }
      
      // Process the response to improve formatting
      const formattedResponse = data.response
        .replace(/\n/g, "<br>")
        .replace(/(\d+\.\s*[^<]+)/g, "<strong>$1</strong>") 
        .replace(/(NOTA:|IMPORTANTE:|ADVERTENCIA:)([^<]+)/gi, "<span class='text-danger'><strong>$1</strong>$2</span>");
      
      // Add assistant message to chat
      const assistantMessage = {
        text: formattedResponse,
        sender: "assistant",
        timestamp: new Date().toISOString(),
        isHtml: true,
        hasAudio: data.audio ? true : false,
        ragUsed: data.rag_used || false
      };
      
      setMessages(prevMessages => [...prevMessages, assistantMessage]);
    } catch (error) {
      console.error("Error sending voice message:", error);
      
      // Add error message to chat
      const errorMessage = {
        text: `Lo siento, hubo un problema al procesar tu consulta de voz: ${error.message}. Por favor, intenta de nuevo.`,
        sender: "assistant",
        timestamp: new Date().toISOString(),
        isError: true
      };
      
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      
      // Desmarcar procesando en caso de error
      isProcessingRef.current = false;
      
      // Reiniciar reconocimiento en caso de error
      if (isListening && !recognitionRef.current) {
        setTimeout(() => startRecognition(), 500);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim()) return;
    
    // Add user message to chat
    const userMessage = {
      text: inputMessage,
      sender: "user",
      timestamp: new Date().toISOString()
    };
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      
      if (!backendUrl) throw new Error("VITE_BACKEND_URL is not defined in .env file");
      
      console.log(`Sending request to ${backendUrl}/api/realtime-chat with message: ${inputMessage}`);
      
      const response = await fetch(`${backendUrl}/api/realtime-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: inputMessage }),
      });
      
      const data = await response.json();
      console.log("Response received:", data);
      
      if (!response.ok) {
        console.error("Error response:", data);
        throw new Error(data.error || "Error communicating with API" + (data.details ? `: ${data.details}` : ""));
      }
      
      // Set audio response to trigger playback
      if (data.audio) {
        console.log("Setting audio response, length:", data.audio.length);
        setAudioResponse(data.audio);
      } else {
        console.warn("No audio data received from API");
        if (data.tts_error) {
          console.error("TTS Error:", data.tts_error);
        }
      }
      
      // Process the response to improve formatting
      const formattedResponse = data.response
        .replace(/\n/g, "<br>")
        .replace(/(\d+\.\s*[^<]+)/g, "<strong>$1</strong>") 
        .replace(/(NOTA:|IMPORTANTE:|ADVERTENCIA:)([^<]+)/gi, "<span class='text-danger'><strong>$1</strong>$2</span>");
      
      // Add assistant message to chat
      const assistantMessage = {
        text: formattedResponse,
        sender: "assistant",
        timestamp: new Date().toISOString(),
        isHtml: true,
        hasAudio: data.audio ? true : false,
        ragUsed: data.rag_used || false
      };
      
      setMessages(prevMessages => [...prevMessages, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      
      // Add error message to chat
      const errorMessage = {
        text: `Lo siento, hubo un problema al procesar tu consulta: ${error.message}. Por favor, intenta de nuevo.`,
        sender: "assistant",
        timestamp: new Date().toISOString(),
        isError: true
      };
      
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container d-flex flex-column h-100">
      <div className="chat-header bg-primary text-white p-3">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h2 className="mb-0">Asistente de Emergencias Médicas en Tiempo Real</h2>
            <p className="mb-0">Conversación continua con base de conocimiento RAG y respuestas de audio</p>
          </div>
          {isListening && (
            <div className="listening-indicator d-flex align-items-center">
              <span className="badge bg-success p-2 d-flex align-items-center">
                <i className="bi bi-mic-fill me-1"></i>
                <span className="ms-1">Escuchando</span>
                <span className="ms-2 listening-animation">
                  <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="chat-messages flex-grow-1 p-3 overflow-auto">
        {messages.length === 0 ? (
          <div className="text-center p-5">
            <h4>¡Bienvenido al Asistente de Emergencias Médicas en Tiempo Real!</h4>
            <p>Esta interfaz utiliza reconocimiento de voz continuo y consulta la base de conocimiento médico RAG para respuestas precisas. Simplemente:</p>
            <div className="bg-light p-3 rounded border my-3">
              <ol className="text-start">
                <li>Haz clic en el botón del micrófono para comenzar</li>
                <li>Habla con naturalidad - el sistema detectará automáticamente cuando hayas terminado</li>
                <li>Escucha la respuesta de audio y continúa la conversación</li>
                <li>Haz clic nuevamente en el micrófono cuando desees finalizar</li>
              </ol>
            </div>
            <p className="text-danger"><strong>IMPORTANTE:</strong> Para emergencias que amenacen la vida, siempre llama primero al 911 o a los servicios de emergencia locales.</p>
            <p>Ejemplos de consultas:</p>
            <ul className="text-start">
              <li>"Alguien se está atragantando, ¿qué debo hacer?"</li>
              <li>"Mi hijo tiene fiebre alta de 39.5°C"</li>
              <li>"Una persona está teniendo una convulsión"</li>
              <li>"¿Cómo realizar RCP en un adulto?"</li>
            </ul>
          </div>
        ) : (
          messages.map((message, index) => (
            <div 
              key={index} 
              className={`message-bubble mb-3 p-3 ${
                message.sender === "user" 
                  ? "user-message ms-auto bg-primary text-white rounded-3" 
                  : message.isError 
                    ? "assistant-message me-auto bg-danger text-white rounded-3" 
                    : "assistant-message me-auto bg-light rounded-3"
              }`}
              style={{ maxWidth: "80%" }}
            >
              <div className="mb-2">
                {message.hasAudio && (
                  <span className="badge bg-info me-2">
                    <small>
                      <i className="bi bi-volume-up"></i> Audio
                    </small>
                  </span>
                )}
                {message.ragUsed && (
                  <span className="badge bg-success">
                    <small>
                      <i className="bi bi-database"></i> RAG
                    </small>
                  </span>
                )}
              </div>
              <div className="message-text">
                {message.isHtml ? 
                  <div dangerouslySetInnerHTML={{ __html: message.text }} /> :
                  message.text
                }
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="message-bubble mb-3 p-3 assistant-message me-auto bg-light rounded-3" style={{ maxWidth: "80%" }}>
            <div className="d-flex align-items-center">
              <span className="me-2">Procesando</span>
              <div className="spinner-grow spinner-grow-sm text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          </div>
        )}
        
        {isListening && inputMessage && !isProcessingRef.current && (
          <div className="message-bubble mb-3 p-3 user-message-preview ms-auto bg-primary bg-opacity-50 text-white rounded-3" style={{ maxWidth: "80%" }}>
            <div className="d-flex align-items-center mb-1">
              <small>
                <i className="bi bi-mic-fill me-1"></i> Escuchando...
              </small>
            </div>
            <div className="fst-italic">{inputMessage}</div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input p-3 border-top">
        <div className="d-flex align-items-center">
          {isListening ? (
            <div className="flex-grow-1 me-2 bg-light rounded p-2">
              <div className="d-flex justify-content-between align-items-center text-muted">
                <span>{inputMessage || "Esperando voz..."}</span>
                <small>1.8s de silencio para enviar</small>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="d-flex flex-grow-1 me-2">
              <input
                type="text"
                className="form-control"
                placeholder="Describe la emergencia médica aquí (con consulta RAG)..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={isLoading}
              />
              <button 
                type="submit" 
                className="btn btn-primary ms-2" 
                disabled={isLoading || !inputMessage.trim()}
              >
                {isLoading ? (
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                ) : (
                  <i className="bi bi-send"></i>
                )}
              </button>
            </form>
          )}
          <button
            type="button"
            className={`btn ${isListening ? 'btn-danger' : 'btn-success'}`}
            onClick={toggleListening}
            disabled={isLoading}
            title={isListening ? 'Detener grabación' : 'Iniciar conversación por voz'}
          >
            <i className={`bi ${isListening ? 'bi-mic-mute-fill' : 'bi-mic-fill'}`}></i>
            <span className="ms-1 d-none d-md-inline">
              {isListening ? 'Finalizar' : 'Hablar'}
            </span>
          </button>
        </div>
      </div>
      
      <style jsx="true">{`
        .listening-animation {
          display: inline-flex;
          align-items: center;
        }
        .dot {
          width: 4px;
          height: 4px;
          margin: 0 2px;
          background-color: white;
          border-radius: 50%;
          animation: pulse 1.5s infinite ease-in-out;
        }
        .dot:nth-child(1) {
          animation-delay: 0s;
        }
        .dot:nth-child(2) {
          animation-delay: 0.3s;
        }
        .dot:nth-child(3) {
          animation-delay: 0.6s;
        }
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.5);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};