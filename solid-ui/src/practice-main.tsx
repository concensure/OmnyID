import { render } from "solid-js/web";
import { PracticeWorkspace } from "@/components/practice/PracticeWorkspace";
import { fetchPracticeBootstrap } from "@/lib/weddingPracticeApi";
import "./practice.css";

const root = document.getElementById("root");
if (root) render(() => <PracticeWorkspace load={fetchPracticeBootstrap} />, root);
