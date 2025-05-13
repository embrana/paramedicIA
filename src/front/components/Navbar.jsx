import { Link } from "react-router-dom";

export const Navbar = () => {
	return (
		<nav className="navbar navbar-expand-lg navbar-dark bg-danger">
			<div className="container">
				<Link to="/">
					<span className="navbar-brand mb-0 h1">Paramedic IA</span>
				</Link>
				<button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav"
					aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
					<span className="navbar-toggler-icon"></span>
				</button>
				<div className="collapse navbar-collapse" id="navbarNav">
					<ul className="navbar-nav ms-auto">
						<li className="nav-item">
							<Link to="/" className="nav-link">
								Emergencias
							</Link>
						</li>
						<li className="nav-item">
							<Link to="/rag-admin" className="nav-link">
								Base de Conocimiento
							</Link>
						</li>
						<li className="nav-item">
							<Link to="/home" className="nav-link">
								Inicio
							</Link>
						</li>
						<li className="nav-item">
							<Link to="/demo" className="nav-link">
								Demo
							</Link>
						</li>
					</ul>
				</div>
			</div>
		</nav>
	);
};