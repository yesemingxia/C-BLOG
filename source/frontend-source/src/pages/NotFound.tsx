import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="text-center">
        <div className="text-7xl font-black gradient-text mb-4">404</div>
        <p className="text-lg text-foreground/60 mb-8">页面不存在</p>
        <button
          onClick={() => navigate("/home")}
          className="btn-primary-glass inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white"
        >
          <ArrowLeft size={16} />
          返回首页
        </button>
      </div>
    </div>
  );
};

export default NotFound;
