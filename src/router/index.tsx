import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

const MatchList = lazy(() => import("../pages/MatchList"));
const MatchDetail = lazy(() => import("../pages/MatchDetail"));

function Loading() {
  return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function AppRouter() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<MatchList />} />
        <Route path="/match/:mid" element={<MatchDetail />} />
      </Routes>
    </Suspense>
  );
}
