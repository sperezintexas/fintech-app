import Link from "next/link";

export default function LoginErrorPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-100">
      <div className="text-center max-w-md rounded-xl bg-white px-6 py-8 shadow-lg">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Too many failed login attempts
        </h1>
        <p className="text-gray-600 mb-6">
          Access from your location has been temporarily restricted. If you
          believe this is an error, please get in touch.
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center justify-center w-full py-3 rounded-lg bg-black text-white font-medium hover:bg-gray-800 transition-colors"
        >
          Contact us
        </Link>
      </div>
    </div>
  );
}
