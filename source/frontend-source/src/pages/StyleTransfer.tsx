import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload, Wand2, Loader2, Download, ImagePlus, AlertCircle, CheckCircle2,
} from "lucide-react";
import { styleApi, type StyleOption, type StyleTaskInfo } from "../lib/api";
import { uploadImage } from "../lib/uploader";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

// 最大图片大小：10MB（原图）
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const STATUS_TEXT: Record<string, string> = {
  pending: "排队中...",
  processing: "AI 绘制中（约 1-2 分钟）...",
  done: "生成完成",
  failed: "生成失败",
};

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "done") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
        <CheckCircle2 size={12} className="mr-1" /> 完成
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="bg-red-500/15 text-red-600 border-red-500/30">
        <AlertCircle size={12} className="mr-1" /> 失败
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">
      <Loader2 size={12} className="mr-1 animate-spin" /> 处理中
    </Badge>
  );
};

const StyleTransfer = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const [imageData, setImageData] = useState<{ file: File; preview: string } | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>("gathered");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  // 拉取可用风格列表
  const { data: styles = [] } = useQuery({
    queryKey: ["styles"],
    queryFn: styleApi.listStyles,
  });

  // 轮询任务状态：pending/processing 时每 3 秒刷新，done/failed 停止
  const { data: task } = useQuery({
    queryKey: ["style-task", taskId],
    queryFn: () => styleApi.getTask(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const t = query.state.data as StyleTaskInfo | undefined;
      if (t && (t.status === "done" || t.status === "failed")) return false;
      return 3000;
    },
  });

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("图片不能超过 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageData({
        file,
        preview: reader.result as string,
      });
      setTaskId(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!imageData) {
      toast.error("请先上传图片");
      return;
    }
    if (!selectedStyle) {
      toast.error("请选择风格");
      return;
    }
    setUploading(true);
    setUploadPct(0);
    const controller = new AbortController();
    cancelRef.current = controller;
    try {
      // @cuiruoni+分片上传（断点续传 + 进度）→ 提交生成任务
      const taskIdResult = await uploadImage(imageData.file, selectedStyle, (p) => {
        setUploadPct(p.percent);
      }, controller.signal);
      setTaskId(taskIdResult);
      toast.success("上传完成，AI 正在绘制");
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") {
        toast.info("上传已取消");
      } else {
        toast.error(e instanceof Error ? e.message : "上传/提交失败");
      }
    } finally {
      cancelRef.current = null;
      setUploading(false);
    }
  };

  const handleCancelUpload = () => {
    cancelRef.current?.abort();
  };

  const handleReset = () => {
    setTaskId(null);
    setImageData(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const running = !!taskId && (task?.status === "pending" || task?.status === "processing");

  return (
    <div className="min-h-screen pt-16">
      <div className="mx-auto px-4 sm:px-6 max-w-[1100px] py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]" style={{ fontFamily: "var(--font-display)" }}>
            图片风格转换
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            上传一张照片，后台 AI 将其重绘为纸刊插画海报风格。支持多种风格，生成约需 1-2 分钟。
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* 左：上传 + 预览 */}
          <Card className="bg-[var(--card)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--foreground)]">1. 上传图片</h2>
                {imageData && (
                  <Badge variant="outline" className="text-[var(--muted-foreground)]">
                    <ImagePlus size={12} className="mr-1" /> 已选择
                  </Badge>
                )}
              </div>

              {!imageData ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors
                    ${dragging ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)] hover:border-[var(--primary)]/60"}`}
                >
                  <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center">
                    <Upload size={20} className="text-[var(--muted-foreground)]" />
                  </div>
                  <div className="text-sm text-[var(--muted-foreground)]">
                    点击选择或拖拽图片到此处
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]/60">支持 JPG / PNG / WebP，最大 10MB</div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden border border-[var(--border)]">
                    <img src={imageData.preview} alt="原图" className="w-full max-h-[340px] object-contain bg-black/40" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={14} className="mr-1.5" /> 重新选择
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleReset} disabled={running}>
                      清除
                    </Button>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </CardContent>
          </Card>

          {/* 右：风格选择 + 生成 */}
          <Card className="bg-[var(--card)]">
            <CardContent className="p-6">
              <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">2. 选择风格</h2>

              <div className="space-y-3">
                {styles.map((s: StyleOption) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStyle(s.id)}
                    disabled={running}
                    className={`w-full text-left rounded-xl border p-4 transition-all duration-200
                      ${selectedStyle === s.id
                        ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm"
                        : "border-[var(--border)] hover:border-[var(--primary)]/40"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-[var(--foreground)]">{s.name}</div>
                      <Badge variant="outline" className="text-[var(--muted-foreground)] text-[10px]">{s.ratio}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted-foreground)] leading-relaxed">{s.description}</div>
                  </button>
                ))}
              </div>

              {/* @cuiruoni+上传进度条：分片上传时显示实时进度（断点续传） */}
              {uploading && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> 上传中（支持断点续传）...
                    </span>
                    <span className="flex items-center gap-2">
                      {uploadPct}%
                      <button
                        onClick={handleCancelUpload}
                        className="text-xs px-2 py-0.5 rounded-md border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
                      >
                        取消
                      </button>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              <Button
                className="w-full mt-5"
                size="lg"
                onClick={handleSubmit}
                disabled={!imageData || uploading || running || task?.status === "done"}
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    上传中 {uploadPct}%
                  </>
                ) : running ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    {STATUS_TEXT[task?.status ?? "processing"]}
                  </>
                ) : task?.status === "done" ? (
                  <>
                    <CheckCircle2 size={16} className="mr-2" /> 生成完成
                  </>
                ) : (
                  <>
                    <Wand2 size={16} className="mr-2" /> 开始生成
                  </>
                )}
              </Button>

              {task?.status === "failed" && (
                <div className="mt-3 text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  {task.error || "生成失败，请重试"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 结果区 */}
        {task?.status === "done" && task.result_url && (
          <Card className="bg-[var(--card)] mt-6">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--foreground)]">3. 生成结果</h2>
                <div className="flex items-center gap-2">
                  <StatusBadge status={task.status} />
                  <Button size="sm" variant="outline" asChild>
                    <a href={task.result_url} download={`style-${task.id}.png`} target="_blank" rel="noreferrer">
                      <Download size={14} className="mr-1.5" /> 下载
                    </a>
                  </Button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-[var(--muted-foreground)] mb-2">原图</div>
                  <img src={imageData?.preview} alt="原图" className="w-full rounded-xl border border-[var(--border)] object-contain bg-black/40" />
                </div>
                <div>
                  <div className="text-xs text-[var(--muted-foreground)] mb-2">AI 生成</div>
                  <img src={task.result_url} alt="生成结果" className="w-full rounded-xl border border-[var(--border)] object-contain bg-black/40" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default StyleTransfer;
