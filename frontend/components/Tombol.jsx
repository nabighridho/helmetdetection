"use client";
import { motion } from "motion/react";

// Tombol dengan umpan balik hover/tekan
export default function Tombol({ utama = false, className = "", children, ...props }) {
  return (
    <motion.button type="button" className={`tombol ${utama ? "tombol-utama" : "tombol-garis"} ${className}`}
      whileHover={props.disabled ? undefined : { y: -2 }}
      whileTap={props.disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      {...props}>
      {children}
    </motion.button>
  );
}
