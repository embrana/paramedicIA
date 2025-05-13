import React from "react";
import { RagUploader } from "../components/RagUploader";

export const RagAdmin = () => {
  return (
    <div className="container mt-4">
      <div className="row">
        <div className="col-12">
          <h2 className="mb-4">Administración de la Base de Conocimiento Médico</h2>
          
          <div className="alert alert-info" role="alert">
            <h5 className="alert-heading">¿Qué es RAG?</h5>
            <p>
              RAG (Retrieval Augmented Generation) es una técnica que mejora las respuestas de IA 
              combinando generación con recuperación de información relevante de una base de conocimiento.
            </p>
            <hr />
            <p className="mb-0">
              Al subir documentos médicos, el sistema convertirá la información en embeddings para 
              recuperar el contenido más relevante cuando se realicen consultas. Esto proporciona 
              respuestas más precisas y específicas.
            </p>
          </div>
          
          <RagUploader />
          
          <div className="card mt-4">
            <div className="card-header bg-secondary text-white">
              <h5 className="mb-0">Instrucciones de Uso</h5>
            </div>
            <div className="card-body">
              <h6>Formato de documentos JSON:</h6>
              <p>Cada documento debe tener el siguiente formato:</p>
              <pre className="bg-light p-3 rounded">
{`{
  "title": "Título del documento médico",
  "source": "Fuente o autor del documento",
  "content": "Contenido detallado del documento médico..."
}`}
              </pre>
              
              <h6 className="mt-3">Recomendaciones:</h6>
              <ul>
                <li>Incluya información médica precisa y actualizada</li>
                <li>Estructure el contenido en pasos numerados cuando sea aplicable</li>
                <li>Incluya protocolos completos para cada procedimiento médico</li>
                <li>Evite incluir opiniones o información sin respaldo científico</li>
              </ul>
              
              <h6 className="mt-3">Uso en el chat:</h6>
              <p>
                Cuando un usuario realice una consulta en el chat, el sistema buscará automáticamente 
                información relevante en la base de conocimiento para proporcionar respuestas más precisas 
                y contextualizadas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};