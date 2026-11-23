import { render } from "solid-js/web";
import VendorResponsePortal from "./components/vendor-response/VendorResponsePortal";
import "./quotation-response.css";

const root = document.getElementById("root");
if (root) render(() => <VendorResponsePortal />, root);
