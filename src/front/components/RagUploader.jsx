import React, { useState, useEffect } from "react";

export const RagUploader = () => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [ragStats, setRagStats] = useState(null);
  const [error, setError] = useState(null);

  // Cargar estadísticas al montar el componente
  useEffect(() => {
    fetchRagStats();
  }, []);

  // Obtener estadísticas de la base RAG
  const fetchRagStats = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      
      if (!backendUrl) throw new Error("VITE_BACKEND_URL is not defined in .env file");
      
      const response = await fetch(`${backendUrl}/api/rag/stats`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Error fetching RAG stats");
      }
      
      setRagStats(data);
      setError(null);
    } catch (err) {
      console.error("Error fetching RAG stats:", err);
      setError("No se pudieron cargar las estadísticas de la base RAG");
    }
  };

  // Manejar cambio de archivo
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setUploadResult(null);
    setError(null);
  };

  // Manejar envío del formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError("Por favor selecciona un archivo JSON");
      return;
    }
    
    setIsUploading(true);
    setError(null);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      
      if (!backendUrl) throw new Error("VITE_BACKEND_URL is not defined in .env file");
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${backendUrl}/api/rag/upload`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Error uploading file");
      }
      
      setUploadResult(data);
      setFile(null);
      
      // Recargar estadísticas
      fetchRagStats();
      
      // Limpiar el input de archivo
      document.getElementById('ragFileInput').value = '';
    } catch (err) {
      console.error("Error uploading file:", err);
      setError(err.message || "Error al subir el archivo");
    } finally {
      setIsUploading(false);
    }
  };

  // Generar ejemplo de formato JSON
  const generateExampleJson = () => {
    const example = {
      title: "Protocolo RCP Adultos",
      source: "Manual de Primeros Auxilios Cruz Roja 2023",
      content: "Protocolo de RCP para adultos:\n1. Asegure la escena y verifique que no haya peligros.\n2. Compruebe si la persona responde. Toque sus hombros y pregunte en voz alta: \"¿Está bien?\"\n3. Si no responde, llame al 911 o pida a alguien que lo haga.\n4. Verifique la respiración. Mire, escuche y sienta si hay respiración normal durante 5-10 segundos.\n5. Si no respira o solo jadea, comience la RCP.\n6. Posición: persona boca arriba sobre superficie firme.\n7. Coloque el talón de una mano en el centro del pecho, entre los pezones.\n8. Coloque la otra mano encima entrelazando los dedos.\n9. Comprima el pecho a una profundidad de 5-6 cm a un ritmo de 100-120 compresiones por minuto.\n10. Después de 30 compresiones, administre 2 respiraciones de rescate si está capacitado.\n11. Continúe ciclos de 30:2 hasta que llegue ayuda o la persona muestre signos de vida."
    };
    
    const jsonString = JSON.stringify(example, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ejemplo_protocolo.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rag-uploader card border-danger">
      <div className="card-header bg-danger text-white">
        <h5 className="mb-0">Administrar Base de Conocimiento Médico (RAG)</h5>
      </div>
      
      <div className="card-body">
        <div className="mb-4">
          <h6>Estadísticas de la Base de Conocimiento:</h6>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          
          {ragStats ? (
            <div>
              <p><strong>Documentos:</strong> {ragStats.document_count}</p>
              <p><strong>Fragmentos totales:</strong> {ragStats.chunk_count}</p>
              
              {ragStats.document_count > 0 && (
                <div>
                  <p><strong>Documentos disponibles:</strong></p>
                  <ul className="list-group">
                    {ragStats.documents.map((title, index) => (
                      <li key={index} className="list-group-item list-group-item-action">
                        {title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p>Cargando estadísticas...</p>
          )}
        </div>
        
        <hr />
        
        <h6>Subir Nuevo Documento:</h6>
        <p className="text-muted">Sube un archivo JSON con información médica para enriquecer la base de conocimiento.</p>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="ragFileInput" className="form-label">Archivo JSON:</label>
            <input 
              type="file" 
              className="form-control" 
              id="ragFileInput" 
              accept=".json"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            <div className="form-text">
              El archivo debe tener el formato: {" "}
              <button 
                type="button" 
                className="btn btn-sm btn-link p-0 align-baseline"
                onClick={generateExampleJson}
              >
                Descargar ejemplo
              </button>
            </div>
          </div>
          
          <div className="d-flex justify-content-between">
            <button 
              type="submit" 
              className="btn btn-danger" 
              disabled={!file || isUploading}
            >
              {isUploading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Subiendo...
                </>
              ) : "Subir Documento"}
            </button>
            
            <button 
              type="button" 
              className="btn btn-outline-secondary" 
              onClick={fetchRagStats}
              disabled={isUploading}
            >
              Actualizar Estadísticas
            </button>
          </div>
        </form>
        
        {uploadResult && (
          <div className="alert alert-success mt-3" role="alert">
            <strong>¡Documento procesado correctamente!</strong><br />
            ID: {uploadResult.document_id}
          </div>
        )}
      </div>
    </div>
  );
};