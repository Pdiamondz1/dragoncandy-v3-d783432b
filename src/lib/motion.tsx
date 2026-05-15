/* eslint-disable react-refresh/only-export-components */
import { LazyMotion, m, useReducedMotion, AnimatePresence } from "framer-motion";

const loadMotionFeatures = () =>
  import("framer-motion").then((mod) => mod.domAnimation);

export { m as motion, useReducedMotion, AnimatePresence, LazyMotion, loadMotionFeatures };

export const tapScale = {
  whileTap: { scale: 0.98, y: 2 },
  transition: { duration: 0.05 },
};

export const liftHover = {
  whileHover: { y: -2 },
  transition: { duration: 0.15 },
};

export const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.3, ease: "easeOut" },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: "easeOut" },
};

export const scaleIn = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.9, opacity: 0 },
  transition: { duration: 0.2 },
};

export const slideUp = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { type: "spring", damping: 25, stiffness: 300 },
};
