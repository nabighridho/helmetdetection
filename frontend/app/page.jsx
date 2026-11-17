"use client";
import { useEffect, useState } from "react";
import HelmetDetection from "@/components/HelmetDetection";
import PengirimHP from "@/components/PengirimHP";

export default function Page() {
  // ?kamera=ID -> HP ini menjadi kamera untuk laptop; tanpa parameter -> aplikasi biasa (laptop atau HP)
  const [idLaptop, setIdLaptop] = useState(undefined);
  useEffect(() => { setIdLaptop(new URLSearchParams(location.search).get("kamera")); }, []);
  if (idLaptop === undefined) return null;
  return idLaptop ? <PengirimHP idLaptop={idLaptop} /> : <HelmetDetection />;
}
