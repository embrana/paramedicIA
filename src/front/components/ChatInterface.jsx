import React, { useState, useRef, useEffect } from "react";

// Función de utilidad para logs detallados
const logEvent = (event, details = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = {
    timestamp,
    event,
    ...details
  };
  
  console.log(`%c[VOZ-LOG] ${event}`, 'background: #333; color: #bada55', logMessage);
  
  // Guardar en localStorage para diagnóstico
  const logs = JSON.parse(localStorage.getItem('voiceLogs') || '[]');
  logs.push(logMessage);
  
  // Mantener solo los últimos 100 logs para no saturar localStorage
  if (logs.length > 100) {
    logs.shift();
  }
  
  localStorage.setItem('voiceLogs', JSON.stringify(logs));
  
  return logMessage;
};

export const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(localStorage.getItem('porteriaSessionId') || '');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [silenceTimer, setSilenceTimer] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastTranscriptTimeRef = useRef(Date.now());
  const speechEventsCountRef = useRef({
    start: 0,
    end: 0,
    result: 0,
    error: 0,
    audiostart: 0,
    audioend: 0,
    soundstart: 0,
    soundend: 0,
    speechstart: 0,
    speechend: 0,
    nomatch: 0
  });

  // Función para agregar un log y actualizar el estado
  const addLog = (event, details = {}) => {
    const logEntry = logEvent(event, details);
    setLogs(prevLogs => [logEntry, ...prevLogs.slice(0, 49)]); // Mantener solo los últimos 50 logs en UI
    return logEntry;
  };

  // Verificar soporte de reconocimiento de voz y síntesis de voz
  useEffect(() => {
    const speechRecognitionSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    const speechSynthesisSupported = 'speechSynthesis' in window;
    
    addLog('INIT', { 
      speechRecognitionSupported, 
      speechSynthesisSupported,
      userAgent: navigator.userAgent,
      platform: navigator.platform
    });
    
    setSpeechSupported(speechRecognitionSupported && speechSynthesisSupported);
    
    if (speechRecognitionSupported) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      // Configuración del reconocimiento de voz
      recognitionRef.current.continuous = true; // Mantener reconocimiento activo
      recognitionRef.current.interimResults = true; // Mostrar resultados intermedios
      recognitionRef.current.lang = 'es-ES';
      recognitionRef.current.maxAlternatives = 3; // Obtener múltiples alternativas
      
      // Intentar configurar mayor sensibilidad al ruido ambiente
      try {
        if (recognitionRef.current.audioThreshold !== undefined) {
          recognitionRef.current.audioThreshold = 0.2; // Valor más bajo para mayor sensibilidad
          addLog('CONFIG', { audioThreshold: 0.2 });
        }
      } catch (error) {
        addLog('CONFIG_ERROR', { error: error.toString() });
      }
      
      // Registrar todos los eventos posibles para diagnóstico
      ['audiostart', 'audioend', 'start', 'end', 'error', 'nomatch', 'soundstart', 'soundend', 'speechstart', 'speechend'].forEach(eventName => {
        recognitionRef.current.addEventListener(eventName, (event) => {
          speechEventsCountRef.current[eventName]++;
          addLog(`SPEECH_EVENT_${eventName.toUpperCase()}`, { 
            count: speechEventsCountRef.current[eventName],
            eventDetails: event
          });
        });
      });
      
      recognitionRef.current.onresult = (event) => {
        speechEventsCountRef.current.result++;
        
        // Reiniciar el temporizador de silencio cada vez que se detecta voz
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          addLog('SILENCE_TIMER_CLEARED');
        }
        
        // Obtener la transcripción actual
        let interimTranscript = '';
        let finalTranscript = '';
        let alternatives = [];
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          
          // Recopilar alternativas para diagnóstico
          if (result.length > 1) {
            for (let j = 0; j < result.length; j++) {
              alternatives.push({
                transcript: result[j].transcript,
                confidence: result[j].confidence
              });
            }
          }
          
          if (result.isFinal) {
            finalTranscript += transcript;
            addLog('FINAL_TRANSCRIPT', { 
              transcript, 
              confidence: result[0].confidence,
              alternatives
            });
          } else {
            interimTranscript += transcript;
            addLog('INTERIM_TRANSCRIPT', { 
              transcript, 
              confidence: result[0].confidence,
              alternatives
            });
          }
        }
        
        // Actualizar la transcripción actual para mostrarla en tiempo real
        const displayTranscript = finalTranscript || interimTranscript;
        if (displayTranscript.trim()) {
          setCurrentTranscript(displayTranscript);
          lastTranscriptTimeRef.current = Date.now();
          
          // Iniciar temporizador de silencio (1.8 segundos)
          const timer = setTimeout(() => {
            addLog('SILENCE_TIMER_TRIGGERED', { transcript: displayTranscript });
            
            if (displayTranscript.trim()) {
              // CORRECCIÓN: Guardar el mensaje en una variable local para asegurar que se envía correctamente
              const messageToSend = displayTranscript.trim();
              addLog('PREPARING_TO_SEND_MESSAGE', { message: messageToSend });
              
              setInputMessage(messageToSend);
              setCurrentTranscript("");
              
              // Usar la variable local en lugar de depender del estado actualizado
              sendMessage(messageToSend);
            }
          }, 1800);
          
          addLog('SILENCE_TIMER_STARTED', { timeoutMs: 1800 });
          setSilenceTimer(timer);
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        addLog('RECOGNITION_ERROR', { 
          error: event.error, 
          message: event.message,
          eventDetails: JSON.stringify(event)
        });
        
        // No detener la escucha en caso de errores no fatales
        if (event.error === 'no-speech') {
          addLog('NO_SPEECH_CONTINUING');
          return;
        }
        
        if (event.error === 'aborted') {
          addLog('RECOGNITION_ABORTED');
          return;
        }
        
        setIsListening(false);
        
        // Reintentar escucha si la llamada sigue activa
        if (callActive && !waitingForResponse) {
          addLog('AUTO_RESTART_AFTER_ERROR', { delayMs: 1000 });
          setTimeout(startListening, 1000);
        }
      };
      
      recognitionRef.current.onend = () => {
        addLog('RECOGNITION_ENDED', { 
          wasListening: isListening,
          callActive,
          waitingForResponse
        });
        
        setIsListening(false);
        
        // Reiniciar escucha automáticamente si la llamada sigue activa
        // y no estamos esperando respuesta del servidor
        if (callActive && !waitingForResponse) {
          addLog('AUTO_RESTART_AFTER_END', { delayMs: 300 });
          setTimeout(startListening, 300);
        }
      };
      
      // Verificar silencio prolongado (más de 5 segundos sin transcripción)
      const silenceCheckInterval = setInterval(() => {
        const timeSinceLastTranscript = Date.now() - lastTranscriptTimeRef.current;
        
        if (isListening && timeSinceLastTranscript > 5000) {
          addLog('PROLONGED_SILENCE_DETECTED', { 
            timeSinceLastTranscriptMs: timeSinceLastTranscript,
            isListening
          });
          
          if (recognitionRef.current) {
            recognitionRef.current.stop();
            addLog('RESTARTING_AFTER_SILENCE', { delayMs: 500 });
            setTimeout(startListening, 500);
          }
        }
      }, 2000);
      
      return () => {
        addLog('CLEANUP_INTERVAL');
        clearInterval(silenceCheckInterval);
      };
    }
    
    // Limpiar al desmontar
    return () => {
      addLog('COMPONENT_UNMOUNT');
      
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }
    };
  }, [callActive, waitingForResponse, silenceTimer, isListening]);

  // Scroll to bottom of chat when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    
    // Leer en voz alta el último mensaje del asistente
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender === "assistant" && !lastMessage.isError) {
      // Extraer texto plano del HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = lastMessage.text;
      const plainText = tempDiv.textContent || tempDiv.innerText || "";
      
      addLog('SPEAKING_ASSISTANT_MESSAGE', { messageLength: plainText.length });
      
      speakText(plainText, () => {
        // Cuando termina de hablar, reactivar la escucha si la llamada sigue activa
        if (callActive) {
          addLog('SPEECH_COMPLETED_REACTIVATING_LISTEN');
          setWaitingForResponse(false);
          setCurrentTranscript(""); // Limpiar transcripción anterior
          startListening();
        }
      });
    }
  }, [messages, callActive]);

  // Función para leer texto en voz alta
  const speakText = (text, onEndCallback) => {
    if (!('speechSynthesis' in window)) {
      addLog('SPEECH_SYNTHESIS_NOT_SUPPORTED');
      return;
    }
    
    // Cancelar cualquier síntesis en curso
    window.speechSynthesis.cancel();
    addLog('SPEECH_SYNTHESIS_PREVIOUS_CANCELLED');
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Obtener voces en español si están disponibles
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(voice => voice.lang.includes('es'));
    
    if (spanishVoice) {
      utterance.voice = spanishVoice;
      addLog('SPEECH_SYNTHESIS_SPANISH_VOICE_FOUND', { 
        voiceName: spanishVoice.name,
        voiceLang: spanishVoice.lang
      });
    } else {
      addLog('SPEECH_SYNTHESIS_NO_SPANISH_VOICE', { 
        availableVoices: voices.map(v => ({ name: v.name, lang: v.lang }))
      });
    }
    
    // Registrar eventos de síntesis de voz
    utterance.onstart = () => {
      addLog('SPEECH_SYNTHESIS_STARTED');
    };
    
    utterance.onpause = () => {
      addLog('SPEECH_SYNTHESIS_PAUSED');
    };
    
    utterance.onresume = () => {
      addLog('SPEECH_SYNTHESIS_RESUMED');
    };
    
    utterance.onerror = (event) => {
      addLog('SPEECH_SYNTHESIS_ERROR', { error: event.error });
    };
    
    // Callback cuando termina de hablar
    utterance.onend = () => {
      addLog('SPEECH_SYNTHESIS_ENDED');
      if (onEndCallback) {
        onEndCallback();
      }
    };
    
    addLog('SPEECH_SYNTHESIS_SPEAKING', { textLength: text.length });
    window.speechSynthesis.speak(utterance);
  };

  // Iniciar escucha
  const startListening = () => {
    if (!isListening && recognitionRef.current && callActive) {
      try {
        addLog('STARTING_RECOGNITION');
        recognitionRef.current.start();
        setIsListening(true);
        lastTranscriptTimeRef.current = Date.now();
      } catch (error) {
        addLog('START_RECOGNITION_ERROR', { 
          error: error.toString(),
          stack: error.stack
        });
        
        // Reintentar después de un tiempo si hay error
        setTimeout(() => {
          if (callActive) {
            addLog('RETRY_START_RECOGNITION', { delayMs: 1000 });
            startListening();
          }
        }, 1000);
      }
    } else {
      addLog('START_LISTENING_SKIPPED', { 
        isListening, 
        hasRecognition: !!recognitionRef.current, 
        callActive 
      });
    }
  };

  // Iniciar llamada (timbre)
  const startCall = () => {
    addLog('CALL_STARTED');
    
    // Limpiar mensajes anteriores si hay una nueva llamada
    if (messages.length > 0) {
      setMessages([]);
      // Generar nueva sesión
      const newSessionId = crypto.randomUUID();
      setSessionId(newSessionId);
      localStorage.setItem('porteriaSessionId', newSessionId);
      addLog('NEW_SESSION_CREATED', { sessionId: newSessionId });
    }
    
    setCallActive(true);
    setCurrentTranscript("");
    
    // Mensaje inicial del portero
    const initialMessage = {
      text: "Buenos días, ¿en qué puedo ayudarle?",
      sender: "assistant",
      timestamp: new Date().toISOString(),
      isHtml: true
    };
    
    addLog('INITIAL_MESSAGE_ADDED');
    setMessages([initialMessage]);
    
    // No activamos la escucha aquí, se activará después de que termine de hablar
    // gracias al callback en el useEffect que observa los mensajes
  };

  // Finalizar llamada
  const endCall = () => {
    addLog('CALL_ENDED');
    setCallActive(false);
    setIsListening(false);
    setWaitingForResponse(false);
    setCurrentTranscript("");
    
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      setSilenceTimer(null);
      addLog('SILENCE_TIMER_CLEARED_ON_END');
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      addLog('RECOGNITION_ABORTED_ON_END');
    }
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      addLog('SPEECH_SYNTHESIS_CANCELLED_ON_END');
    }
  };

  // NUEVA FUNCIÓN: Enviar mensaje directamente sin depender del estado
  const sendMessage = async (messageText) => {
    if (!messageText || !messageText.trim()) {
      addLog('DIRECT_SEND_MESSAGE_EMPTY');
      return;
    }
    
    addLog('DIRECT_SEND_MESSAGE', { message: messageText });
    
    // Detener escucha mientras procesamos
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      addLog('RECOGNITION_ABORTED_FOR_PROCESSING');
    }
    
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      setSilenceTimer(null);
      addLog('SILENCE_TIMER_CLEARED_FOR_PROCESSING');
    }
    
    setIsListening(false);
    setWaitingForResponse(true);
    setCurrentTranscript("");
    
    // Add user message to chat
    const userMessage = {
      text: messageText,
      sender: "user",
      timestamp: new Date().toISOString()
    };
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      
      if (!backendUrl) {
        const error = new Error("VITE_BACKEND_URL is not defined in .env file");
        addLog('BACKEND_URL_MISSING', { error: error.toString() });
        throw error;
      }
      
      addLog('API_REQUEST_STARTED', { 
        url: `${backendUrl}/api/chat`,
        message: messageText,
        sessionId
      });
      
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          message: messageText,
          session_id: sessionId
        }),
      });
      
      const data = await response.json();
      addLog('API_RESPONSE_RECEIVED', { 
        status: response.status,
        ok: response.ok,
        sessionId: data.session_id,
        responseLength: data.response ? data.response.length : 0
      });
      
      // Guardar el ID de sesión si es nuevo
      if (data.session_id && data.session_id !== sessionId) {
        setSessionId(data.session_id);
        localStorage.setItem('porteriaSessionId', data.session_id);
        addLog('SESSION_ID_UPDATED', { newSessionId: data.session_id });
      }
      
      if (!response.ok) {
        addLog('API_ERROR_RESPONSE', { 
          status: response.status,
          error: data.error,
          details: data.details
        });
        throw new Error(data.error || "Error communicating with API" + (data.details ? `: ${data.details}` : ""));
      }
      
      // Procesar la respuesta para mejorar el formato
      const formattedResponse = data.response
        .replace(/\n/g, "<br>")
        .replace(/(\d+\.\s*[^<]+)/g, "<strong>$1</strong>") // Destacar pasos numerados
        .replace(/(NOTA:|IMPORTANTE:|ADVERTENCIA:)([^<]+)/gi, "<span class='text-danger'><strong>$1</strong>$2</span>"); // Destacar notas importantes
      
      addLog('RESPONSE_FORMATTED');
      
      // Add assistant message to chat
      const assistantMessage = {
        text: formattedResponse,
        sender: "assistant",
        timestamp: new Date().toISOString(),
        isHtml: true,
        ragUsed: data.rag_used // Indicar si se usó RAG
      };
      
      setMessages(prevMessages => [...prevMessages, assistantMessage]);
      addLog('ASSISTANT_MESSAGE_ADDED');
      
      // La escucha se reactivará automáticamente después de que el asistente termine de hablar
      // gracias al callback en speakText
      
    } catch (error) {
      addLog('MESSAGE_PROCESSING_ERROR', { 
        error: error.toString(),
        stack: error.stack
      });
      
      // Add error message to chat
      const errorMessage = {
        text: `Lo siento, hubo un problema al procesar tu consulta: ${error.message}. Por favor, intenta de nuevo.`,
        sender: "assistant",
        timestamp: new Date().toISOString(),
        isError: true
      };
      
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      addLog('ERROR_MESSAGE_ADDED');
      
      // Reactivar escucha después de error
      setWaitingForResponse(false);
      if (callActive) {
        addLog('REACTIVATING_LISTEN_AFTER_ERROR', { delayMs: 1000 });
        setTimeout(startListening, 1000);
      }
    } finally {
      setIsLoading(false);
      addLog('MESSAGE_PROCESSING_COMPLETED');
    }
  };

  // Función original para manejar el envío de formulario (ahora usa sendMessage)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    const messageToSend = inputMessage.trim();
    if (!messageToSend) {
      addLog('FORM_SEND_MESSAGE_EMPTY');
      return;
    }
    
    addLog('FORM_SEND_MESSAGE', { message: messageToSend });
    sendMessage(messageToSend);
  };

  // Función para exportar logs
  const exportLogs = () => {
    const allLogs = JSON.parse(localStorage.getItem('voiceLogs') || '[]');
    const blob = new Blob([JSON.stringify(allLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `porteria-voice-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog('LOGS_EXPORTED', { count: allLogs.length });
  };

  // Función para limpiar logs
  const clearLogs = () => {
    localStorage.removeItem('voiceLogs');
    setLogs([]);
    addLog('LOGS_CLEARED');
  };

  return (
    <div className="chat-container d-flex flex-column h-100">
      <div className="chat-header bg-primary text-white p-3 d-flex justify-content-between align-items-center">
        <div>
          <h2 className="mb-0">Portero Virtual</h2>
          <p className="mb-0">Asistente de control de acceso al edificio</p>
        </div>
        <div className="d-flex align-items-center">
          {/* Botón para mostrar/ocultar logs */}
          <button 
            className="btn btn-sm btn-outline-light me-2"
            onClick={() => setShowLogs(!showLogs)}
            title="Mostrar/ocultar logs de diagnóstico"
          >
            <i className="bi bi-bug"></i>
          </button>
          
          {callActive ? (
            <button 
              className="btn btn-danger btn-lg rounded-circle"
              onClick={endCall}
              title="Finalizar llamada"
            >
              <i className="bi bi-telephone-x"></i>
            </button>
          ) : (
            <button 
              className="btn btn-success btn-lg rounded-circle"
              onClick={startCall}
              title="Tocar timbre"
              disabled={!speechSupported}
            >
              <i className="bi bi-bell-fill"></i>
            </button>
          )}
        </div>
      </div>
      
      {/* Panel de logs de diagnóstico */}
      {showLogs && (
        <div className="logs-panel bg-dark text-light p-2" style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem' }}>
          <div className="d-flex justify-content-between mb-2">
            <h6 className="mb-0">Logs de diagnóstico</h6>
            <div>
              <button className="btn btn-sm btn-outline-light me-2" onClick={exportLogs}>
                <i className="bi bi-download"></i> Exportar
              </button>
              <button className="btn btn-sm btn-outline-danger" onClick={clearLogs}>
                <i className="bi bi-trash"></i> Limpiar
              </button>
            </div>
          </div>
          <div className="logs-container">
            {logs.map((log, index) => (
              <div key={index} className="log-entry mb-1">
                <small>
                  <span className="text-secondary">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  {' '}
                  <span className={`badge ${
                    log.event.includes('ERROR') ? 'bg-danger' : 
                    log.event.includes('WARN') ? 'bg-warning text-dark' : 
                    'bg-info text-dark'
                  }`}>
                    {log.event}
                  </span>
                  {' '}
                  {Object.entries(log)
                    .filter(([key]) => !['timestamp', 'event'].includes(key))
                    .map(([key, value]) => (
                      <span key={key} className="text-light">
                        {key}: {typeof value === 'object' ? JSON.stringify(value) : value.toString()}
                      </span>
                    ))
                  }
                </small>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="chat-messages flex-grow-1 p-3 overflow-auto">
        {messages.length === 0 ? (
          <div className="text-center p-5">
            <h4>¡Bienvenido al Sistema de Portería Virtual!</h4>
            <p>Este sistema funciona como un intercomunicador real de portería.</p>
            <p className="text-primary"><strong>INSTRUCCIONES:</strong></p>
            <ol className="text-start">
              <li>Presione el botón de timbre <i className="bi bi-bell-fill text-success"></i> para iniciar la llamada</li>
              <li>El portero le saludará automáticamente</li>
              <li>Hable con normalidad cuando vea el indicador de micrófono activo</li>
              <li>No es necesario presionar ningún botón durante la conversación</li>
              <li>Para finalizar, presione el botón rojo <i className="bi bi-telephone-x text-danger"></i></li>
            </ol>
            <div className="mt-4">
              <button 
                className="btn btn-success btn-lg"
                onClick={startCall}
                disabled={!speechSupported}
              >
                <i className="bi bi-bell-fill me-2"></i>
                Tocar Timbre
              </button>
            </div>
            {!speechSupported && (
              <div className="alert alert-warning mt-3">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                Su navegador no soporta reconocimiento de voz. Por favor, utilice Chrome, Edge o Safari.
              </div>
            )}
          </div>
        ) : (
          <>
            {callActive && (
              <div className="call-status text-center mb-3">
                <span className={`badge ${isListening ? 'bg-success' : 'bg-secondary'} p-2`}>
                  {isListening ? (
                    <>
                      <i className="bi bi-mic-fill me-2"></i>
                      Escuchando...
                    </>
                  ) : waitingForResponse ? (
                    <>
                      <i className="bi bi-hourglass-split me-2"></i>
                      Esperando respuesta...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-volume-up-fill me-2"></i>
                      Portero hablando...
                    </>
                  )}
                </span>
              </div>
            )}
            
            {/* Mostrar transcripción en tiempo real */}
            {callActive && isListening && currentTranscript && (
              <div className="current-transcript mb-3 p-3 user-message ms-auto bg-info text-white rounded-3" style={{ maxWidth: "80%", opacity: 0.8 }}>
                <div className="d-flex align-items-center mb-1">
                  <i className="bi bi-mic-fill me-2"></i>
                  <small>Transcribiendo...</small>
                </div>
                <div>{currentTranscript}</div>
              </div>
            )}
            
            {messages.map((message, index) => (
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
                {message.ragUsed && (
                  <div className="badge bg-success mb-2">
                    <small>
                      <i className="bi bi-database-check"></i> Base de conocimiento utilizada
                    </small>
                  </div>
                )}
                <div className="message-text">
                  {message.isHtml ? 
                    <div dangerouslySetInnerHTML={{ __html: message.text }} /> :
                    message.text
                  }
                </div>
              </div>
            ))}
            
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
          </>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Formulario oculto durante la llamada activa */}
      {!callActive && messages.length > 0 && (
        <div className="chat-input p-3 border-top">
          <form onSubmit={handleSendMessage} className="d-flex">
            <input
              type="text"
              className="form-control me-2"
              placeholder="Indique el motivo de su visita..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isLoading}
            />
            
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isLoading || !inputMessage.trim()}
            >
              {isLoading ? (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              ) : (
                "Enviar"
              )}
            </button>
          </form>
        </div>
      )}
      
      {/* Información de diagnóstico en modo desarrollo */}
      {import.meta.env.DEV && (
        <div className="debug-info p-2 bg-dark text-light">
          <small>
            <strong>Debug:</strong> {isListening ? 'Escuchando' : 'No escuchando'} | 
            Llamada: {callActive ? 'Activa' : 'Inactiva'} | 
            Esperando: {waitingForResponse ? 'Sí' : 'No'} | 
            Eventos: {Object.entries(speechEventsCountRef.current).map(([k, v]) => `${k}:${v}`).join(', ')}
          </small>
        </div>
      )}
    </div>
  );
};
