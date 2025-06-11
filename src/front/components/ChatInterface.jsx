import React, { useState, useRef, useEffect } from "react";

export const ChatInterface = () => {
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
  
  // Play audio response when available
  useEffect(() => {
    if (audioResponse) {
      const audio = new Audio(`data:audio/mp3;base64,${audioResponse}`);
      audioRef.current = audio;
      audio.play().catch(error => {
        console.error("Error playing audio:", error);
      });
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [audioResponse]);

  // Handle microphone access and voice recognition
  const toggleListening = async () => {
    try {
      if (!isListening) {
        // Check if browser supports SpeechRecognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          alert("Tu navegador no soporta el reconocimiento de voz. Intenta con Chrome, Edge o Safari.");
          return;
        }
        
        setIsListening(true);
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onresult = async (event) => {
          const transcript = event.results[0][0].transcript;
          setInputMessage(transcript);
          
          // Send voice message to backend immediately
          await sendVoiceMessage(transcript);
        };
        
        recognition.onerror = (event) => {
          console.error("Error de reconocimiento de voz:", event.error);
          setIsListening(false);
        };
        
        recognition.onend = () => {
          setIsListening(false);
        };
        
        recognition.start();
      } else {
        setIsListening(false);
        // Stop recognition if it's active
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.stop();
        }
      }
    } catch (error) {
      console.error("Error al acceder al micrófono:", error);
      setIsListening(false);
      alert("No se pudo acceder al micrófono. Verifica los permisos de tu navegador.");
    }
  };
  
  // Process voice message with backend voice API
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
      
      console.log(`Sending voice request to ${backendUrl}/api/voice-chat with message: ${message}`);
      
      const response = await fetch(`${backendUrl}/api/voice-chat`, {
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
        setAudioResponse(data.audio);
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
        ragUsed: data.rag_used,
        hasAudio: data.audio ? true : false
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
      
      console.log(`Sending request to ${backendUrl}/api/chat with message: ${inputMessage}`);
      
      const response = await fetch(`${backendUrl}/api/chat`, {
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
      
      // Procesar la respuesta para mejorar el formato
      const formattedResponse = data.response
        .replace(/\n/g, "<br>")
        .replace(/(\d+\.\s*[^<]+)/g, "<strong>$1</strong>") // Destacar pasos numerados
        .replace(/(NOTA:|IMPORTANTE:|ADVERTENCIA:)([^<]+)/gi, "<span class='text-danger'><strong>$1</strong>$2</span>"); // Destacar notas importantes
      
      // Add assistant message to chat
      const assistantMessage = {
        text: formattedResponse,
        sender: "assistant",
        timestamp: new Date().toISOString(),
        isHtml: true,
        ragUsed: data.rag_used // Indicar si se usó RAG
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
      <div className="chat-header bg-danger text-white p-3">
        <h2 className="mb-0">Asistente de Emergencias Médicas</h2>
        <p className="mb-0">Consulta sobre primeros auxilios y procedimientos de emergencia</p>
      </div>
      
      <div className="chat-messages flex-grow-1 p-3 overflow-auto">
        {messages.length === 0 ? (
          <div className="text-center p-5">
            <h4>¡Bienvenido al Asistente de Emergencias Médicas!</h4>
            <p>Describe la situación de emergencia y te proporcionaré instrucciones claras sobre cómo proceder.</p>
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
              {message.ragUsed && (
                <div className="badge bg-success mb-2 me-1">
                  <small>
                    <i className="bi bi-database-check"></i> Base de conocimiento utilizada
                  </small>
                </div>
              )}
              {message.hasAudio && (
                <div className="badge bg-info mb-2">
                  <small>
                    <i className="bi bi-volume-up"></i> Respuesta con audio
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
          ))
        )}
        
        {isLoading && (
          <div className="message-bubble mb-3 p-3 assistant-message me-auto bg-light rounded-3" style={{ maxWidth: "80%" }}>
            <div className="d-flex align-items-center">
              <span className="me-2">Procesando</span>
              <div className="spinner-grow spinner-grow-sm text-danger" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input p-3 border-top">
        <form onSubmit={handleSendMessage} className="d-flex">
          <input
            type="text"
            className="form-control me-2"
            placeholder="Describe la emergencia médica aquí..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="button"
            className={`btn ${isListening ? 'btn-success' : 'btn-outline-secondary'} me-2`}
            onClick={toggleListening}
            disabled={isLoading}
            title={isListening ? 'Detener grabación' : 'Hablar'}
          >
            <i className={`bi ${isListening ? 'bi-mic-fill' : 'bi-mic'}`}></i>
          </button>
          <button 
            type="submit" 
            className="btn btn-danger" 
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
    </div>
  );
};