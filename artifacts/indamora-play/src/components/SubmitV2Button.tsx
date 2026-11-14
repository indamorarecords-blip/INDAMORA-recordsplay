import { Link } from "wouter";

export default function SubmitV2Button() {
  return (
    <Link href="/submit-v2">
      <button
        type="button"
        className="rounded-lg px-5 py-3 font-semibold"
      >
        Essayer le nouvel espace de soumission
      </button>
    </Link>
  );
}
