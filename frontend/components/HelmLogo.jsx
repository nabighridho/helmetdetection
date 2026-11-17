"use client";
import { motion } from "motion/react";

// Logo helm full face (tampak samping)
export default function HelmLogo({ className = "", ...props }) {
  return (
    <motion.svg className={className} viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <path d="M8 38C7 21 19 8 35 8c12.5 0 21 8.5 23.3 19.5l.7 9.5c1.6 2 2.2 5 1.8 8.3C59.9 50 56 53 51 53H17c-5 0-8.6-6-9-15z" fill="#F2C230" />
      <path d="M8.4 41c1.5 7 4.5 12 8.6 12h34c4.6 0 8.6-3 9.5-8.5C52 44 31 46 8.4 41z" fill="#D69E12" />
      <path d="M13 22c6-8 15-11.5 24-11" fill="none" stroke="#15171C" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M27 25.5c8-3.5 19-4 28.5-1.6 1.7.4 2.7 1.8 2.8 3.5l.4 6.8c.1 1.5-1.1 2.8-2.6 2.8H33.5c-4.6 0-7.6-4.6-6.5-11.5z" fill="#15171C" />
      <path d="M30.5 27.6c6-2 14-2.5 21-1.4" fill="none" stroke="#5B6474" strokeWidth="2" strokeLinecap="round" />
      <path d="M46.5 33.5l5-5.6M51 34l4.2-4.8" stroke="#3A4150" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="27.5" cy="31" r="3.2" fill="#F4F1E8" />
      <circle cx="27.5" cy="31" r="1.3" fill="#15171C" />
      <rect x="47" y="41.2" width="9.5" height="2.2" rx="1.1" fill="#15171C" />
      <rect x="49" y="45.2" width="7" height="2.2" rx="1.1" fill="#15171C" />
      <path d="M15 53h35" stroke="#F4F1E8" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M8.5 30.5l-3.5 2 3.4 2.4" fill="#F2C230" stroke="#F2C230" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M18 17c2.5-2.6 5.4-4.3 8.5-5.2" fill="none" stroke="#FFE38A" strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  );
}
