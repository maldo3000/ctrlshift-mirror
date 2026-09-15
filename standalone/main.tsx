import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

document.documentElement.dataset.staticApp="true";
createRoot(document.getElementById("root")!).render(<Home/>);
