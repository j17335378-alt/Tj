import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { mountTikjil } from "@/tikjil/engine";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return mountTikjil(el);
  }, []);
  return <div ref={ref} />;
}
