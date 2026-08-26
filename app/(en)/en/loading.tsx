export default function EnglishLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-10">
      <div className="h-8 w-72 rounded bg-sand" />
      <div className="mt-4 h-4 w-full max-w-xl rounded bg-sand" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="aspect-[4/3] rounded-lg bg-sand" />
        ))}
      </div>
    </div>
  );
}
