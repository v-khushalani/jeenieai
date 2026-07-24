import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Highlighter, Move, Pencil, X, Minimize2, Maximize2, Target, WandSparkles } from 'lucide-react';

type Point = { x: number; y: number };
type DrawTool = 'pen' | 'highlighter' | 'eraser' | 'magicEraser' | 'laser';
type StrokeTool = 'pen' | 'highlighter';

type Stroke = {
	id: string;
	tool: StrokeTool;
	color: string;
	width: number;
	alpha: number;
	points: Point[];
};

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#0f172a'];

const AnnotationOverlay: React.FC = () => {
	const rootRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const activeStrokeRef = useRef<Stroke | null>(null);
	const strokesRef = useRef<Stroke[]>([]);
	const dragStateRef = useRef<{ active: boolean; id: number; offsetX: number; offsetY: number }>({
		active: false,
		id: -1,
		offsetX: 0,
		offsetY: 0,
	});
	const drawStateRef = useRef<{ drawing: boolean; last: Point | null }>({ drawing: false, last: null });
	const laserTimeoutRef = useRef<number | null>(null);

	const [annotationMode, setAnnotationMode] = useState(false);
	const [tool, setTool] = useState<DrawTool>('pen');
	const [lineWidth, setLineWidth] = useState(3);
	const [highlighterOpacity, setHighlighterOpacity] = useState(0.2);
	const [color, setColor] = useState(COLORS[0]);
	const [collapsed, setCollapsed] = useState(true);
	const [isPanelVisible, setIsPanelVisible] = useState(false);
	const [panelPos, setPanelPos] = useState({ x: 16, y: 16 });

	const [laserPoint, setLaserPoint] = useState<Point | null>(null);
	const [renderVersion, setRenderVersion] = useState(0);

	const drawStyle = useMemo(() => {
		if (tool === 'highlighter') return { color, width: Math.max(10, lineWidth * 2.5), alpha: highlighterOpacity };
		return { color, width: lineWidth, mode: 'source-over' as GlobalCompositeOperation, alpha: 1 };
	}, [tool, color, lineWidth, highlighterOpacity]);

	const getCtx = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		return { canvas, ctx };
	}, []);

	const resizeCanvas = useCallback(() => {
		const root = rootRef.current;
		const payload = getCtx();
		if (!root || !payload) return;

		const { canvas, ctx } = payload;
		const dpr = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.floor(root.clientWidth));
		const height = Math.max(1, Math.floor(root.clientHeight));

		const snapshot = document.createElement('canvas');
		snapshot.width = canvas.width;
		snapshot.height = canvas.height;
		const snapCtx = snapshot.getContext('2d');
		if (snapCtx) {
			snapCtx.drawImage(canvas, 0, 0);
		}

		canvas.width = Math.floor(width * dpr);
		canvas.height = Math.floor(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';

		if (snapshot.width > 0 && snapshot.height > 0) {
			ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, width, height);
		}
		setRenderVersion((v) => v + 1);
	}, [getCtx]);

	const renderStrokes = useCallback(() => {
		const payload = getCtx();
		if (!payload) return;
		const { canvas, ctx } = payload;
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		for (const stroke of strokesRef.current) {
			if (stroke.points.length < 2) continue;
			ctx.save();
			ctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = stroke.tool === 'highlighter' ? stroke.alpha : 1;
			ctx.strokeStyle = stroke.color;
			ctx.lineWidth = stroke.width;
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			if (stroke.tool === 'highlighter') {
				ctx.globalCompositeOperation = 'multiply';
			}
			ctx.beginPath();
			ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
			for (let i = 1; i < stroke.points.length; i++) {
				ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
			}
			ctx.stroke();
			ctx.closePath();
			ctx.restore();
		}
	}, [getCtx]);

	useEffect(() => {
		resizeCanvas();
		const root = rootRef.current;
		if (!root) return;

		const ro = new ResizeObserver(() => resizeCanvas());
		ro.observe(root);
		return () => ro.disconnect();
	}, [resizeCanvas]);

	useEffect(() => {
		resizeCanvas();
	}, [annotationMode, resizeCanvas]);

	useEffect(() => {
		renderStrokes();
	}, [renderVersion, renderStrokes]);

	const toLocalPoint = useCallback((evt: React.PointerEvent<HTMLCanvasElement>): Point | null => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		return {
			x: evt.clientX - rect.left,
			y: evt.clientY - rect.top,
		};
	}, []);

	const beginPath = useCallback((p: Point) => {
		drawStateRef.current.drawing = true;
		drawStateRef.current.last = p;

		if (tool === 'pen' || tool === 'highlighter') {
			activeStrokeRef.current = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				tool,
				color: drawStyle.color,
				width: drawStyle.width,
				alpha: tool === 'highlighter' ? drawStyle.alpha : 1,
				points: [p],
			};
		}
	}, [tool, drawStyle]);

	const eraseAtPoint = useCallback((point: Point, radius: number) => {
		const radiusSq = radius * radius;
		const next: Stroke[] = [];

		for (const stroke of strokesRef.current) {
			const kept = stroke.points.filter((pt) => {
				const dx = pt.x - point.x;
				const dy = pt.y - point.y;
				return (dx * dx) + (dy * dy) > radiusSq;
			});
			if (kept.length >= 2) {
				next.push({ ...stroke, points: kept });
			}
		}

		strokesRef.current = next;
		setRenderVersion((v) => v + 1);
	}, []);

	const deleteStrokeAtPoint = useCallback((point: Point) => {
		let bestIdx = -1;
		let bestDistanceSq = Number.POSITIVE_INFINITY;

		for (let i = 0; i < strokesRef.current.length; i++) {
			const stroke = strokesRef.current[i];
			for (const pt of stroke.points) {
				const dx = pt.x - point.x;
				const dy = pt.y - point.y;
				const dSq = dx * dx + dy * dy;
				if (dSq < bestDistanceSq) {
					bestDistanceSq = dSq;
					bestIdx = i;
				}
			}
		}

		if (bestIdx >= 0 && bestDistanceSq <= (22 * 22)) {
			strokesRef.current = strokesRef.current.filter((_, idx) => idx !== bestIdx);
			setRenderVersion((v) => v + 1);
		}
	}, []);

	const showLaser = useCallback((point: Point) => {
		setLaserPoint(point);
		if (laserTimeoutRef.current !== null) {
			window.clearTimeout(laserTimeoutRef.current);
		}
		laserTimeoutRef.current = window.setTimeout(() => {
			setLaserPoint(null);
		}, 420);
	}, []);

	const continuePath = useCallback((p: Point) => {
		if (!drawStateRef.current.drawing || !drawStateRef.current.last) return;

		if (tool === 'pen' || tool === 'highlighter') {
			if (!activeStrokeRef.current) return;
			activeStrokeRef.current.points.push(p);
			setRenderVersion((v) => v + 1);
		} else if (tool === 'eraser') {
			eraseAtPoint(p, Math.max(12, lineWidth * 3.5));
		} else if (tool === 'laser') {
			showLaser(p);
		}

		drawStateRef.current.last = p;
	}, [tool, lineWidth, eraseAtPoint, showLaser]);

	const endPath = useCallback(() => {
		if (drawStateRef.current.drawing && activeStrokeRef.current && activeStrokeRef.current.points.length >= 2) {
			strokesRef.current = [...strokesRef.current, activeStrokeRef.current];
			setRenderVersion((v) => v + 1);
		}
		activeStrokeRef.current = null;
		drawStateRef.current.drawing = false;
		drawStateRef.current.last = null;
	}, []);

	const onCanvasPointerDown = (evt: React.PointerEvent<HTMLCanvasElement>) => {
		if (!annotationMode) return;
		const p = toLocalPoint(evt);
		if (!p) return;
		evt.preventDefault();
		evt.currentTarget.setPointerCapture(evt.pointerId);

		if (tool === 'magicEraser') {
			deleteStrokeAtPoint(p);
			return;
		}

		if (tool === 'laser') {
			showLaser(p);
		}

		beginPath(p);
	};

	const onCanvasPointerMove = (evt: React.PointerEvent<HTMLCanvasElement>) => {
		if (!annotationMode || !drawStateRef.current.drawing) return;
		const p = toLocalPoint(evt);
		if (!p) return;
		evt.preventDefault();
		continuePath(p);
	};

	const onCanvasPointerUp = (evt: React.PointerEvent<HTMLCanvasElement>) => {
		if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}
		endPath();
	};

	const onCanvasPointerCancel = (evt: React.PointerEvent<HTMLCanvasElement>) => {
		if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}
		endPath();
	};

	const startDragPanel = (evt: React.PointerEvent<HTMLDivElement>) => {
		if (!panelRef.current || dragStateRef.current.active) return;
		evt.preventDefault();
		const panelRect = panelRef.current.getBoundingClientRect();
		dragStateRef.current = {
			active: true,
			id: evt.pointerId,
			offsetX: evt.clientX - panelRect.left,
			offsetY: evt.clientY - panelRect.top,
		};
		evt.currentTarget.setPointerCapture(evt.pointerId);
	};

	const movePanel = (evt: React.PointerEvent<HTMLDivElement>) => {
		const state = dragStateRef.current;
		if (!state.active || state.id !== evt.pointerId) return;
		const root = rootRef.current;
		const panel = panelRef.current;
		if (!root || !panel) return;

		const rootRect = root.getBoundingClientRect();
		const panelWidth = panel.offsetWidth;
		const panelHeight = panel.offsetHeight;

		const nextX = evt.clientX - rootRect.left - state.offsetX;
		const nextY = evt.clientY - rootRect.top - state.offsetY;
		const clampedX = Math.min(Math.max(0, nextX), Math.max(0, rootRect.width - panelWidth));
		const clampedY = Math.min(Math.max(0, nextY), Math.max(0, rootRect.height - panelHeight));

		setPanelPos({ x: clampedX, y: clampedY });
	};

	const stopDragPanel = (evt: React.PointerEvent<HTMLDivElement>) => {
		const state = dragStateRef.current;
		if (state.active && state.id === evt.pointerId) {
			if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
				evt.currentTarget.releasePointerCapture(evt.pointerId);
			}
			dragStateRef.current = { active: false, id: -1, offsetX: 0, offsetY: 0 };
		}
	};

	const clearCanvas = () => {
		strokesRef.current = [];
		activeStrokeRef.current = null;
		setRenderVersion((v) => v + 1);
	};

	const closePanel = () => {
		setAnnotationMode(false);
		setCollapsed(true);
		setIsPanelVisible(false);
	};

	return (
		<div ref={rootRef} className="absolute inset-0 z-20 pointer-events-none select-none">
			{annotationMode && (
				<canvas
					ref={canvasRef}
					className="absolute inset-0 pointer-events-auto"
					onPointerDown={onCanvasPointerDown}
					onPointerMove={onCanvasPointerMove}
					onPointerUp={onCanvasPointerUp}
					onPointerCancel={onCanvasPointerCancel}
				/>
			)}

			{!annotationMode && <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />}

			{laserPoint && annotationMode && tool === 'laser' && (
				<div
					className="absolute pointer-events-none z-30"
					style={{ left: `${laserPoint.x - 9}px`, top: `${laserPoint.y - 9}px` }}
				>
					<div className="h-[18px] w-[18px] rounded-full bg-red-500/30 animate-ping" />
					<div className="absolute inset-[4px] rounded-full bg-red-600 shadow-[0_0_18px_rgba(220,38,38,0.9)]" />
				</div>
			)}

      {!isPanelVisible && (
        <div className="absolute pointer-events-auto right-14 top-3 z-30">
					<Button
						size="sm"
						variant="secondary"
            className="h-8 rounded-full px-3 text-xs shadow-md border border-border bg-card/95 text-foreground"
						onClick={() => {
							setIsPanelVisible(true);
							setCollapsed(false);
						}}
					>
						Open Annotation
					</Button>
				</div>
			)}

			{isPanelVisible && (
				<div
					ref={panelRef}
          className="absolute pointer-events-auto w-[240px] max-w-[85vw] rounded-xl border border-border bg-card/95 backdrop-blur-sm shadow-lg"
					style={{ transform: `translate(${panelPos.x}px, ${panelPos.y}px)` }}
				>
          <div className="flex items-center justify-between px-2.5 py-2 border-b border-border">
						<div
              className="flex items-center gap-2 text-[11px] font-semibold text-foreground cursor-grab active:cursor-grabbing"
							onPointerDown={startDragPanel}
							onPointerMove={movePanel}
							onPointerUp={stopDragPanel}
							onPointerCancel={stopDragPanel}
						>
							<Move className="h-3.5 w-3.5" />
							Annotation
						</div>
						<div className="flex items-center gap-1">
							<Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCollapsed((v) => !v)}>
								{collapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
							</Button>
							<Button size="icon" variant="ghost" className="h-7 w-7" onClick={closePanel}>
								<X className="h-3.5 w-3.5" />
							</Button>
						</div>
					</div>

					{!collapsed && (
						<div className="p-2.5 space-y-2.5">
							<div className="flex items-center gap-2">
								<Button
									size="sm"
									variant={annotationMode ? 'default' : 'outline'}
									className="h-8 px-2 text-xs"
									onClick={() => setAnnotationMode((v) => !v)}
								>
									{annotationMode ? 'Draw: ON' : 'Interact: ON'}
								</Button>
								<Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={clearCanvas}>Clear</Button>
							</div>

							<div className="grid grid-cols-5 gap-1.5">
								<Button size="sm" variant={tool === 'pen' ? 'default' : 'outline'} className="h-8 px-2" onClick={() => setTool('pen')}>
									<Pencil className="h-3.5 w-3.5" />
								</Button>
								<Button size="sm" variant={tool === 'highlighter' ? 'default' : 'outline'} className="h-8 px-2" onClick={() => setTool('highlighter')}>
									<Highlighter className="h-3.5 w-3.5" />
								</Button>
								<Button size="sm" variant={tool === 'eraser' ? 'default' : 'outline'} className="h-8 px-2" onClick={() => setTool('eraser')}>
									<Eraser className="h-3.5 w-3.5" />
								</Button>
								<Button size="sm" variant={tool === 'magicEraser' ? 'default' : 'outline'} className="h-8 px-2" onClick={() => setTool('magicEraser')}>
									<WandSparkles className="h-3.5 w-3.5" />
								</Button>
								<Button size="sm" variant={tool === 'laser' ? 'default' : 'outline'} className="h-8 px-2" onClick={() => setTool('laser')}>
									<Target className="h-3.5 w-3.5" />
								</Button>
							</div>

							<div className="flex items-center gap-2">
								{COLORS.map((c) => (
									<button
										key={c}
										type="button"
										onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border ${color === c ? 'ring-2 ring-foreground border-foreground' : 'border-border'}`}
										style={{ backgroundColor: c }}
										aria-label={`Pick color ${c}`}
									/>
								))}
							</div>

							<div className="space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">Stroke: {lineWidth}px</div>
								<input
									type="range"
									min={1}
									max={16}
									value={lineWidth}
									onChange={(e) => setLineWidth(parseInt(e.target.value, 10))}
									className="w-full"
								/>
							</div>

							{tool === 'highlighter' && (
								<div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">Opacity: {Math.round(highlighterOpacity * 100)}%</div>
									<input
										type="range"
										min={8}
										max={45}
										value={Math.round(highlighterOpacity * 100)}
										onChange={(e) => setHighlighterOpacity(parseInt(e.target.value, 10) / 100)}
										className="w-full"
									/>
								</div>
							)}

            <div className="text-[10px] text-muted-foreground leading-relaxed">
								Magic eraser removes one full stroke. Laser is non-writing pointer mode.
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default AnnotationOverlay;
