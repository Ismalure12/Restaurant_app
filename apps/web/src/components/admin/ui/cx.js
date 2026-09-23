/** Join class names, skipping falsy parts. */
export default function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}
