import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Helpers ───
const fmt = (n) => new Intl.NumberFormat("ko-KR").format(n);
const toISO = (d) => d.toISOString().split("T")[0];
const todayStr = () => toISO(new Date());
const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 86400000);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const defaultState = {
  participants: [],
  settings: { durationWeeks: 12, goalPercent: 8, startDate: todayStr(), rule: "winner-takes-all" },
  started: false,
  // v1.1 additions
  dailyLogs: {},    // { "2026-02-17": { meals: {...}, exercise: {...}, fasting: {...}, water: 0, sleep: 0 } }
  fastingPhase: 1,  // 1=12:12, 2=14:10, 3=16:8
  roadmapWeek: 1,
};

// ─── Confetti ───
const Confetti = ({ show }) => {
  if (!show) return null;
  const colors = ["#FFD700","#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8"];
  return (
    <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:9999}}>
      {Array.from({length:50}).map((_,i)=>{
        const left=Math.random()*100, delay=Math.random()*2, dur=2+Math.random()*3;
        return <div key={i} style={{position:"absolute",left:`${left}%`,top:"-10px",width:8,height:5,backgroundColor:colors[i%colors.length],borderRadius:2,animation:`cfall ${dur}s ease-in ${delay}s forwards`,transform:`rotate(${Math.random()*360}deg)`}}/>;
      })}
      <style>{`@keyframes cfall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}`}</style>
    </div>
  );
};

// ─── Sparkline ───
const Sparkline = ({ data, color = "#4ECDC4", width = 180, height = 50 }) => {
  if (!data || data.length < 2) return <span style={{color:"#666",fontSize:11}}>데이터 2개 이상 필요</span>;
  const min = Math.min(...data)-0.3, max = Math.max(...data)+0.3, range = max-min||1;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*width},${height-((v-min)/range)*height}`);
  const area = `0,${height} ${pts.join(" ")} ${width},${height}`;
  const lastX = width, lastY = height-((data[data.length-1]-min)/range)*height;
  return (
    <svg width={width} height={height} style={{display:"block"}}>
      <defs><linearGradient id={`sg${color.slice(1)}`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor={color} stopOpacity="0.25"/><stop offset="100%" stopColor={color} stopOpacity="0.02"/></linearGradient></defs>
      <polygon points={area} fill={`url(#sg${color.slice(1)})`}/>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={lastX} cy={lastY} r="3.5" fill={color} stroke="#1a1a3e" strokeWidth="2"/>
    </svg>
  );
};

// ─── Progress Ring ───
const Ring = ({ pct, size=70, stroke=7, color="#4ECDC4" }) => {
  const r=(size-stroke)/2, c=2*Math.PI*r, p=clamp(pct,0,100), off=c-(p/100)*c;
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset 0.6s ease"}}/>
    </svg>
  );
};

// ─── Mini Bar Chart ───
const MiniBar = ({ value, max, color, label, unit="" }) => {
  const pct = max > 0 ? clamp((value/max)*100, 0, 100) : 0;
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
        <span style={{color:"#999"}}>{label}</span>
        <span style={{fontWeight:600,color:pct>=90?"#4ECDC4":pct>=60?"#FFEAA7":"#FF6B6B"}}>{value}{unit} / {max}{unit}</span>
      </div>
      <div style={{height:6,borderRadius:3,background:"rgba(255,255,255,0.06)"}}>
        <div style={{height:"100%",borderRadius:3,background:color||"#4ECDC4",width:`${pct}%`,transition:"width 0.4s"}}/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// DATA: 박요셉 맞춤 운동 & 식단 루틴
// ═══════════════════════════════════════════

const WEEKLY_SCHEDULE = [
  { day:"월", type:"상체 근력 + Zone 2 유산소", duration:60, intensity:"중강도", icon:"🏋️", color:"#FF6B6B",
    exercises:[
      {name:"덤벨 벤치프레스",sets:"3×12",rest:"60초",note:"가슴+삼두"},
      {name:"덤벨 로우 (원암)",sets:"3×12",rest:"60초",note:"등+이두"},
      {name:"오버헤드 프레스",sets:"3×10",rest:"60초",note:"어깨"},
      {name:"페이스풀 (밴드)",sets:"3×15",rest:"45초",note:"후면 어깨/자세교정"},
      {name:"플랭크",sets:"3×45초",rest:"30초",note:"코어 안정화"},
      {name:"Zone 2 유산소 (빠른 걷기)",sets:"20분",rest:"-",note:"심박 120~135bpm"},
    ]},
  { day:"화", type:"Zone 2 유산소 (빠른 걷기/조깅)", duration:40, intensity:"저~중강도", icon:"🏃", color:"#4ECDC4",
    exercises:[
      {name:"빠른 걷기 or 조깅",sets:"40분",rest:"-",note:"심박 120~135bpm 유지"},
    ]},
  { day:"수", type:"하체 근력 + 코어", duration:60, intensity:"중강도", icon:"🦵", color:"#45B7D1",
    exercises:[
      {name:"고블릿 스쿼트",sets:"3×12",rest:"60초",note:"대퇴사두/둔근"},
      {name:"루마니안 데드리프트",sets:"3×10",rest:"90초",note:"후면 사슬 전체"},
      {name:"불가리안 스플릿 스쿼트",sets:"3×10(각)",rest:"60초",note:"편측 균형"},
      {name:"카프 레이즈",sets:"3×15",rest:"30초",note:"종아리"},
      {name:"데드버그",sets:"3×10(각)",rest:"30초",note:"코어 안정화"},
      {name:"사이드 플랭크",sets:"3×30초(각)",rest:"30초",note:"옆구리/코어"},
    ]},
  { day:"목", type:"능동적 휴식 (스트레칭/요가)", duration:30, intensity:"저강도", icon:"🧘", color:"#96CEB4",
    exercises:[
      {name:"전신 스트레칭",sets:"15분",rest:"-",note:"유연성 향상"},
      {name:"요가 또는 폼롤러",sets:"15분",rest:"-",note:"근막 이완/회복"},
    ]},
  { day:"금", type:"전신 복합 + Zone 2 유산소", duration:60, intensity:"중강도", icon:"💥", color:"#FFEAA7",
    exercises:[
      {name:"케틀벨 스윙",sets:"3×15",rest:"60초",note:"전신 폭발력/심폐"},
      {name:"푸시업 (변형 가능)",sets:"3×15",rest:"45초",note:"가슴/코어"},
      {name:"덤벨 런지 워크",sets:"3×12보",rest:"60초",note:"하체/균형"},
      {name:"TRX 로우 또는 턱걸이",sets:"3×8~12",rest:"60초",note:"등/이두"},
      {name:"마운틴 클라이머",sets:"3×30초",rest:"30초",note:"코어/심폐"},
      {name:"Zone 2 유산소 (조깅)",sets:"20분",rest:"-",note:"심박 120~135bpm"},
    ]},
  { day:"토", type:"Zone 2 유산소 (등산/자전거/수영)", duration:75, intensity:"저~중강도", icon:"⛰️", color:"#DDA0DD",
    exercises:[
      {name:"장시간 유산소",sets:"60~90분",rest:"-",note:"등산/자전거/수영 택 1"},
    ]},
  { day:"일", type:"완전 휴식 또는 가벼운 산책", duration:0, intensity:"회복", icon:"🌿", color:"#98D8C8",
    exercises:[
      {name:"가벼운 산책 (선택)",sets:"자유",rest:"-",note:"몸과 마음의 회복"},
    ]},
];

const MEAL_PLAN = {
  workout: {
    label: "운동일 식단",
    targetCal: 1900,
    targetProtein: 130,
    meals: [
      { time:"07:00", name:"🌅 아침", cal:500, protein:33, items:["계란 스크램블 3개 (단백질 18g)","통밀빵 or 현미밥 ½공기","그릭 요거트 150g (단백질 15g)","견과류 한 줌 (20g)"] },
      { time:"12:00", name:"☀️ 점심", cal:650, protein:40, items:["닭가슴살 or 등심 구이 150g","현미밥 2/3 공기","채소 반찬 (브로콜리/시금치/당근)","김치/된장국"] },
      { time:"15:00", name:"🥤 간식", cal:200, protein:25, items:["프로틴 셰이크 (MooMoo A2 우유 300ml)","사과 or 바나나 1개"] },
      { time:"18:30", name:"🌙 저녁", cal:550, protein:32, items:["생선구이 (고등어/연어/삼치) 150g","고구마 or 감자 중 1개","샐러드 (올리브오일 드레싱)","두부/달걀 반찬"] },
    ],
  },
  rest: {
    label: "비운동일 식단",
    targetCal: 1700,
    targetProtein: 130,
    meals: [
      { time:"07:00", name:"🌅 아침", cal:500, protein:33, items:["계란 스크램블 3개","통밀빵 or 현미밥","그릭 요거트 150g","견과류 한 줌"] },
      { time:"12:00", name:"☀️ 점심", cal:550, protein:40, items:["단백질 150g (닭/생선/두부)","밥 1/2공기 (탄수↓)","채소 반찬 충분히","된장국"] },
      { time:"18:30", name:"🌙 저녁", cal:450, protein:35, items:["단백질 150g + 채소 위주","탄수화물 제외","샐러드 (올리브오일)","두부/달걀 반찬"] },
    ],
  },
};

const FASTING_PHASES = [
  { phase:1, name:"12:12 적응기", fastHrs:12, eatHrs:12, cutoff:"19:00", firstMeal:"07:00", weeks:"1~2주" },
  { phase:2, name:"14:10 본격기", fastHrs:14, eatHrs:10, cutoff:"18:00", firstMeal:"08:00", weeks:"3~6주" },
  { phase:3, name:"16:8 심화기", fastHrs:16, eatHrs:8, cutoff:"18:00", firstMeal:"10:00", weeks:"6주 이후" },
];

const ROADMAP = [
  { phase:"1단계 적응기", weeks:"1~3주", exercise:"운동 습관 형성, Zone 2 위주, 주 4회", diet:"12:12 단식, 정제 탄수 제거, 단백질↑", target:"74.0kg (-1.5kg)", color:"#4ECDC4" },
  { phase:"2단계 가속기", weeks:"4~6주", exercise:"근력 운동 추가, Zone 2 유지, 주 5회", diet:"14:10 단식, 식단 최적화, 간식 조절", target:"72.0kg (-3.5kg)", color:"#45B7D1" },
  { phase:"3단계 심화기", weeks:"7~9주", exercise:"강도 증가, 장시간 유산소, 주 5~6회", diet:"16:8 단식, 비운동일 탄수 감량", target:"70.5kg (-5.0kg)", color:"#FFEAA7" },
  { phase:"4단계 정착기", weeks:"10~12주", exercise:"루틴 고정화, 기록 비교, 주 5회", diet:"지속 가능한 식습관 정착", target:"69.3kg (-6.2kg)", color:"#FFD700" },
];

const RANCH_ACTIVITIES = [
  { name:"목초지 걷기/순찰", cal:"200~350", icon:"🚶" },
  { name:"건초 운반/짐 나르기", cal:"300~500", icon:"📦" },
  { name:"울타리 작업/삽질", cal:"250~400", icon:"🔨" },
  { name:"소 관리/사료 급여", cal:"200~300", icon:"🐄" },
  { name:"고지대 산책/등산", cal:"350~500", icon:"⛰️" },
];

const DAILY_TIMELINE = [
  { time:"06:00", activity:"기상 + 물 500ml", icon:"💧", note:"대사 활성화" },
  { time:"06:15", activity:"가벼운 스트레칭 (10분)", icon:"🤸", note:"몸 깨우기" },
  { time:"06:30", activity:"성경 묵상 / 기도", icon:"📖", note:"Ora (기도하라)" },
  { time:"07:00", activity:"아침 식사 (500kcal)", icon:"🍳", note:"단백질 우선 섭취" },
  { time:"08:00", activity:"목장 업무 (Labora)", icon:"🐄", note:"목장 노동 = 운동" },
  { time:"12:00", activity:"점심 식사 (650kcal)", icon:"🍱", note:"탄수화물 적정량" },
  { time:"15:00", activity:"간식 + 운동", icon:"💪", note:"프로틴 → 근력/유산소" },
  { time:"18:30", activity:"저녁 식사 (550kcal)", icon:"🐟", note:"생선/채소 위주" },
  { time:"19:00", activity:"가족 시간 / 독서 (Lege)", icon:"📚", note:"블루라이트 차단" },
  { time:"22:00", activity:"취침", icon:"🌙", note:"7~8시간 수면 확보" },
];

// ─── Weekly Missions (v1.1 updated) ───
const MISSIONS_V11 = [
  ["Zone 2 유산소 3회 달성","물 2L 매일 마시기","야식 0회","12:12 단식 실천 5일"],
  ["근력 운동 2회 달성","단백질 130g 이상 5일","11시 이전 취침 5일","정제 탄수화물 제로"],
  ["10,000보 걷기 4일","14:10 단식 실천 5일","프로틴 셰이크 매일","식단 기록 매일"],
  ["Zone 2 유산소 4회 달성","체중 매일 기록 완료","총 목표 80% 이상 달성","16:8 단식 도전"],
];

const COLORS = ["#4ECDC4","#FF6B6B","#45B7D1","#FFEAA7","#96CEB4","#DDA0DD","#FF8A5C","#98D8C8"];

// ═══════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════
export default function App() {
  const [state, setState] = useState(defaultState);
  const [tab, setTab] = useState("dash");
  const [confetti, setConfetti] = useState(false);
  const [celeb, setCeleb] = useState(null);
  // form states
  const [fName, setFName] = useState("");
  const [fWeight, setFWeight] = useState("");
  const [fBet, setFBet] = useState("50000");
  const [rName, setRName] = useState("");
  const [rWeight, setRWeight] = useState("");
  // v1.1 states
  const [exerciseDay, setExerciseDay] = useState(() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1; // 0=월 ... 6=일
  });
  const [mealType, setMealType] = useState("workout");
  const [expandedExercise, setExpandedExercise] = useState(null);

  // ── Storage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("battle-diet-v11");
      if (saved) setState(JSON.parse(saved));
    } catch {}
  }, []);

  const save = useCallback((ns) => {
    setState(ns);
    try { localStorage.setItem("battle-diet-v11", JSON.stringify(ns)); } catch {}
  }, []);

  const { participants: parts, settings: cfg, dailyLogs } = state;

  // ── Derived ──
  const endDate = useMemo(() => {
    const d = new Date(cfg.startDate);
    d.setDate(d.getDate() + cfg.durationWeeks * 7);
    return toISO(d);
  }, [cfg.startDate, cfg.durationWeeks]);

  const daysLeft = Math.max(0, daysBetween(todayStr(), endDate));
  const totalDays = cfg.durationWeeks * 7;
  const elapsed = totalDays - daysLeft;
  const curWeek = Math.min(Math.ceil(Math.max(elapsed,1) / 7), cfg.durationWeeks);
  const totalPot = useMemo(() => parts.reduce((s, p) => s + p.bet, 0), [parts]);

  // current roadmap phase
  const curPhase = curWeek <= 3 ? 0 : curWeek <= 6 ? 1 : curWeek <= 9 ? 2 : 3;

  // today's log
  const today = todayStr();
  const todayLog = dailyLogs[today] || { meals:{}, exercises:{}, water:0, sleep:0, fasting:false, ranchWork:[] };

  const updateTodayLog = (updates) => {
    const newLog = { ...todayLog, ...updates };
    save({ ...state, dailyLogs: { ...dailyLogs, [today]: newLog } });
  };

  // today's day of week for schedule
  const todayDayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const isWorkoutDay = [0,1,2,4,5].includes(todayDayIdx); // 월화수금토

  const board = useMemo(() => {
    return parts.map((p) => {
      const ws = p.recs.map(r => r.w);
      const cur = ws.length > 0 ? ws[ws.length - 1] : p.sw;
      const goal = p.sw * (1 - cfg.goalPercent / 100);
      const loss = p.sw - cur;
      const lossR = (loss / p.sw) * 100;
      const tgtLoss = p.sw - goal;
      const prog = tgtLoss > 0 ? (loss / tgtLoss) * 100 : 0;
      let streak = 0;
      const dates = p.recs.map(r => r.d).sort().reverse();
      let dd = new Date();
      for (let i = 0; i < 60; i++) {
        if (dates.includes(toISO(dd))) streak++;
        else if (i > 0) break;
        dd.setDate(dd.getDate() - 1);
      }
      return { ...p, cur, goal, loss, lossR, prog, streak, done: cur <= goal, ws };
    }).sort((a, b) => b.prog - a.prog);
  }, [parts, cfg.goalPercent]);

  // daily nutrition tracking
  const todayMeals = todayLog.meals || {};
  const checkedMealCount = Object.values(todayMeals).filter(Boolean).length;
  const currentPlan = MEAL_PLAN[isWorkoutDay ? "workout" : "rest"];
  const totalMeals = currentPlan.meals.length;
  const estimatedCal = currentPlan.meals.reduce((s, m, i) => s + (todayMeals[i] ? m.cal : 0), 0);
  const estimatedProtein = currentPlan.meals.reduce((s, m, i) => s + (todayMeals[i] ? m.protein : 0), 0);

  // daily exercise tracking
  const todayExercises = todayLog.exercises || {};
  const todaySchedule = WEEKLY_SCHEDULE[todayDayIdx];
  const exerciseChecks = todaySchedule.exercises.map((_, i) => todayExercises[i] || false);
  const exerciseDone = exerciseChecks.filter(Boolean).length;

  // weekly exercise completion
  const weekExerciseStats = useMemo(() => {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      const key = toISO(d);
      const log = dailyLogs[key];
      if (log?.exercises && Object.values(log.exercises).some(Boolean)) done++;
    }
    return done;
  }, [dailyLogs]);

  // ── Actions ──
  const addPart = () => {
    if (!fName.trim() || !fWeight) return;
    const w = parseFloat(fWeight), b = parseInt(fBet) || 50000;
    if (w < 30 || w > 200 || parts.some(p => p.name === fName.trim())) return;
    save({ ...state, participants: [...parts, { id: Date.now().toString(), name: fName.trim(), sw: w, bet: b, recs: [{ d: todayStr(), w }], mis: {} }] });
    setFName(""); setFWeight(""); setFBet("50000");
  };

  const rmPart = (id) => save({ ...state, participants: parts.filter(p => p.id !== id) });

  const doRec = () => {
    const w = parseFloat(rWeight);
    if (!rName || !w || w < 30 || w > 200) return;
    const up = parts.map(p => {
      if (p.name !== rName) return p;
      const filtered = p.recs.filter(r => r.d !== todayStr());
      return { ...p, recs: [...filtered, { d: todayStr(), w }] };
    });
    const ns = { ...state, participants: up };
    save(ns);
    const person = up.find(p => p.name === rName);
    if (person) {
      const g = person.sw * (1 - cfg.goalPercent / 100);
      if (w <= g) { setConfetti(true); setCeleb(rName); setTimeout(() => { setConfetti(false); setCeleb(null); }, 5000); }
    }
    setRWeight("");
  };

  const togMis = (pid, wk, mi) => {
    const up = parts.map(p => {
      if (p.id !== pid) return p;
      const k = `w${wk}-m${mi}`;
      return { ...p, mis: { ...p.mis, [k]: !p.mis[k] } };
    });
    save({ ...state, participants: up });
  };

  const togMeal = (idx) => {
    const newMeals = { ...todayMeals, [idx]: !todayMeals[idx] };
    updateTodayLog({ meals: newMeals });
  };

  const togExercise = (idx) => {
    const newEx = { ...todayExercises, [idx]: !todayExercises[idx] };
    updateTodayLog({ exercises: newEx });
  };

  const setWater = (cups) => updateTodayLog({ water: cups });
  const setSleep = (hrs) => updateTodayLog({ sleep: hrs });
  const togFasting = () => updateTodayLog({ fasting: !todayLog.fasting });

  const addRanchWork = (activity) => {
    const rw = [...(todayLog.ranchWork || []), { activity, time: new Date().toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" }) }];
    updateTodayLog({ ranchWork: rw });
  };

  const updCfg = (k, v) => save({ ...state, settings: { ...cfg, [k]: v } });
  const startGame = () => { if (parts.length > 0) save({ ...state, started: true, settings: { ...cfg, startDate: todayStr() } }); };
  const resetAll = () => { if (confirm("정말 모든 데이터를 초기화하시겠습니까?")) { save(defaultState); setTab("dash"); } };

  // ── Current fasting info ──
  const fastingInfo = FASTING_PHASES[clamp((state.fastingPhase || 1) - 1, 0, 2)];

  // ── Styles ──
  const S = {
    app: { fontFamily:"'Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", minHeight:"100vh", background:"linear-gradient(160deg,#0a0a1a 0%,#141432 40%,#1a0a2e 70%,#0a0a1a 100%)", color:"#e8e8f0", padding:0 },
    wrap: { maxWidth:860, margin:"0 auto", padding:"12px 16px" },
    card: { background:"rgba(255,255,255,0.045)", backdropFilter:"blur(12px)", borderRadius:16, padding:"18px", marginBottom:14, border:"1px solid rgba(255,255,255,0.06)" },
    glow: (c) => ({ background:`linear-gradient(135deg,${c}10,${c}05)`, border:`1px solid ${c}22` }),
    btn: { padding:"9px 18px", borderRadius:10, border:"none", cursor:"pointer", fontWeight:600, fontSize:13, transition:"all 0.2s" },
    pri: { background:"linear-gradient(135deg,#4ECDC4,#44B89D)", color:"#fff" },
    sec: { background:"linear-gradient(135deg,#45B7D1,#3A9BC5)", color:"#fff" },
    dan: { background:"linear-gradient(135deg,#FF6B6B,#EE5A24)", color:"#fff" },
    gho: { background:"transparent", color:"#aaa", border:"1px solid rgba(255,255,255,0.12)" },
    warn: { background:"linear-gradient(135deg,#FFEAA7,#F9CA24)", color:"#333" },
    inp: { padding:"9px 12px", borderRadius:9, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#e8e8f0", fontSize:13, outline:"none", width:"100%" },
    lbl: { fontSize:11, color:"#8888aa", marginBottom:3, display:"block", fontWeight:500 },
    met: { fontSize:26, fontWeight:700, lineHeight:1.2 },
    metL: { fontSize:10, color:"#8888aa", marginTop:3, fontWeight:500, textTransform:"uppercase", letterSpacing:0.5 },
    tabB: (a) => ({ padding:"6px 11px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:a?600:400, background:a?"rgba(78,205,196,0.18)":"transparent", color:a?"#4ECDC4":"#666", transition:"all 0.2s" }),
    badge: (c) => ({ display:"inline-block", padding:"2px 7px", borderRadius:5, fontSize:10, fontWeight:600, background:`${c}22`, color:c }),
    flex: { display:"flex", alignItems:"center", gap:8 },
    check: (ck, c="#4ECDC4") => ({
      width:22, height:22, borderRadius:6,
      border: ck ? "none" : "2px solid rgba(255,255,255,0.12)",
      background: ck ? c : "transparent",
      display:"flex", alignItems:"center", justifyContent:"center",
      flexShrink:0, fontSize:12, color:"#fff", cursor:"pointer", transition:"all 0.2s"
    }),
    chipBtn: (active, c="#4ECDC4") => ({
      padding:"6px 12px", borderRadius:8, border:"none", cursor:"pointer",
      fontSize:11, fontWeight:active?600:400,
      background: active ? `${c}22` : "rgba(255,255,255,0.03)",
      color: active ? c : "#777", transition:"all 0.2s"
    }),
  };

  // ── Tab navigation ──
  const TABS = [
    ["dash","📊 대시보드"],
    ["routine","🗓️ 루틴"],
    ["meal","🍽️ 식단"],
    ["exercise","💪 운동"],
    ["rec","⚖️ 기록"],
    ["mis","🎯 미션"],
    ["rank","🏆 랭킹"],
    ["mgmt","⚙️ 관리"],
  ];

  return (
    <div style={S.app}>
      <Confetti show={confetti}/>
      {celeb && (
        <div style={{position:"fixed",inset:0,zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)"}}>
          <div style={{textAlign:"center",animation:"cpop 0.5s ease"}}>
            <div style={{fontSize:56,marginBottom:12}}>🎉🏆🎉</div>
            <div style={{fontSize:24,fontWeight:800,color:"#FFD700",marginBottom:6}}>{celeb} 님 목표 달성!</div>
            <div style={{fontSize:14,color:"#ccc"}}>축하합니다! The Winner Takes It All!</div>
            <button onClick={()=>{setConfetti(false);setCeleb(null)}} style={{...S.btn,...S.pri,marginTop:16}}>확인</button>
          </div>
          <style>{`@keyframes cpop{0%{transform:scale(0.3);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
        </div>
      )}

      <div style={S.wrap}>
        {/* Header */}
        <div style={{textAlign:"center",padding:"18px 0 10px"}}>
          <div style={{fontSize:11,color:"#4ECDC4",fontWeight:600,letterSpacing:2.5,marginBottom:2}}>BATTLE DIET</div>
          <h1 style={{fontSize:22,fontWeight:800,margin:"0 0 2px",background:"linear-gradient(135deg,#4ECDC4,#FFD700)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>🥊 살 떨리는 승부 v1.1</h1>
          <p style={{color:"#555",fontSize:11,margin:0}}>운동 & 식단 루틴 통합 에디션 — MooMoo Ranch 🐄</p>
        </div>

        {/* Nav */}
        <div style={{display:"flex",justifyContent:"center",gap:2,marginBottom:14,flexWrap:"wrap"}}>
          {TABS.map(([id,lb])=>(
            <button key={id} onClick={()=>setTab(id)} style={S.tabB(tab===id)}>{lb}</button>
          ))}
        </div>

        {/* ══════ DASHBOARD ══════ */}
        {tab==="dash"&&(<>
          {/* Top Metrics */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
            {[
              ["💰",fmt(totalPot),"총 상금","#FFD700"],
              ["👥",parts.length,"참가자","#4ECDC4"],
              [`D-${daysLeft}`,state.started?"":"미시작","남은 일수","#FF6B6B"],
              ["🔥",`${curWeek}/${cfg.durationWeeks}`,"현재 주차","#FFEAA7"],
            ].map(([v,sub,lb,c],i)=>(
              <div key={i} style={{...S.card,textAlign:"center",padding:"12px 6px",...S.glow(c)}}>
                <div style={{...S.met,color:c,fontSize:20}}>{v}</div>
                {sub&&<div style={{fontSize:10,color:"#777"}}>{sub}</div>}
                <div style={S.metL}>{lb}</div>
              </div>
            ))}
          </div>

          {/* Today's Quick Status */}
          <div style={{...S.card,...S.glow("#4ECDC4")}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>📋 오늘의 현황 ({["일","월","화","수","목","금","토"][new Date().getDay()]}요일)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div style={{textAlign:"center",padding:"8px 4px",borderRadius:10,background:"rgba(78,205,196,0.06)"}}>
                <div style={{fontSize:20,fontWeight:700,color:"#4ECDC4"}}>{checkedMealCount}/{totalMeals}</div>
                <div style={{fontSize:10,color:"#888"}}>식사 완료</div>
              </div>
              <div style={{textAlign:"center",padding:"8px 4px",borderRadius:10,background:"rgba(255,107,107,0.06)"}}>
                <div style={{fontSize:20,fontWeight:700,color:"#FF6B6B"}}>{exerciseDone}/{todaySchedule.exercises.length}</div>
                <div style={{fontSize:10,color:"#888"}}>운동 완료</div>
              </div>
              <div style={{textAlign:"center",padding:"8px 4px",borderRadius:10,background:"rgba(255,234,167,0.06)"}}>
                <div style={{fontSize:20,fontWeight:700,color:"#FFEAA7"}}>{todayLog.water||0}/8</div>
                <div style={{fontSize:10,color:"#888"}}>물 (잔)</div>
              </div>
            </div>
            <div style={{marginTop:10}}>
              <MiniBar value={estimatedCal} max={currentPlan.targetCal} color="#4ECDC4" label="칼로리" unit="kcal"/>
              <MiniBar value={estimatedProtein} max={currentPlan.targetProtein} color="#FF6B6B" label="단백질" unit="g"/>
            </div>
          </div>

          {/* 12-Week Roadmap */}
          {state.started && (
            <div style={S.card}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>🗺️ 12주 로드맵</div>
              <div style={{display:"flex",gap:4,marginBottom:10}}>
                {ROADMAP.map((r,i) => (
                  <div key={i} style={{flex:1,height:6,borderRadius:3,background:i<=curPhase?r.color:"rgba(255,255,255,0.06)",transition:"background 0.3s"}}/>
                ))}
              </div>
              <div style={{...S.card,...S.glow(ROADMAP[curPhase].color),padding:12,marginBottom:0}}>
                <div style={{fontWeight:700,color:ROADMAP[curPhase].color,fontSize:13,marginBottom:4}}>
                  {ROADMAP[curPhase].phase} ({ROADMAP[curPhase].weeks})
                </div>
                <div style={{fontSize:11,color:"#aaa",lineHeight:1.6}}>
                  <div>💪 {ROADMAP[curPhase].exercise}</div>
                  <div>🍽️ {ROADMAP[curPhase].diet}</div>
                  <div>🎯 목표: <strong style={{color:ROADMAP[curPhase].color}}>{ROADMAP[curPhase].target}</strong></div>
                </div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {state.started&&(
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
                <span style={{fontWeight:600}}>전체 진행률</span>
                <span style={{color:"#4ECDC4"}}>{Math.round((elapsed/totalDays)*100)}%</span>
              </div>
              <div style={{height:7,borderRadius:4,background:"rgba(255,255,255,0.06)"}}>
                <div style={{height:"100%",borderRadius:4,background:"linear-gradient(90deg,#4ECDC4,#44B89D)",width:`${Math.min(100,(elapsed/totalDays)*100)}%`,transition:"width 0.5s"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:"#555"}}>
                <span>{cfg.startDate}</span><span>{endDate}</span>
              </div>
            </div>
          )}

          {/* Participant cards */}
          {board.length===0?(
            <div style={{...S.card,textAlign:"center",padding:32}}>
              <div style={{fontSize:44,marginBottom:10}}>🥊</div>
              <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>참가자를 등록하세요!</div>
              <div style={{fontSize:12,color:"#888",marginBottom:14}}>관리 탭에서 참가자 추가 후 게임을 시작하세요.</div>
              <button onClick={()=>setTab("mgmt")} style={{...S.btn,...S.pri}}>참가자 등록하기</button>
            </div>
          ):(
            board.map((p,idx)=>(
              <div key={p.id} style={{...S.card,...S.glow(COLORS[idx%COLORS.length])}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
                  <div style={{flex:"1 1 180px"}}>
                    <div style={S.flex}>
                      <span style={{fontSize:16,fontWeight:800,color:COLORS[idx%COLORS.length]}}>
                        {idx===0?"👑":`#${idx+1}`} {p.name}
                      </span>
                      {p.done&&<span style={S.badge("#4ECDC4")}>달성!</span>}
                      {p.streak>=3&&<span style={S.badge("#FFEAA7")}>🔥{p.streak}일</span>}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginTop:8}}>
                      <div><div style={S.metL}>현재</div><div style={{fontSize:17,fontWeight:700}}>{p.cur.toFixed(1)}<span style={{fontSize:11,color:"#777"}}>kg</span></div></div>
                      <div><div style={S.metL}>감량</div><div style={{fontSize:17,fontWeight:700,color:p.loss>0?"#4ECDC4":"#FF6B6B"}}>{p.loss>0?"-":"+"}{Math.abs(p.loss).toFixed(1)}<span style={{fontSize:11}}>kg</span></div></div>
                      <div><div style={S.metL}>목표까지</div><div style={{fontSize:17,fontWeight:700,color:"#FFEAA7"}}>{Math.max(0,p.cur-p.goal).toFixed(1)}<span style={{fontSize:11}}>kg</span></div></div>
                    </div>
                    <div style={{marginTop:5,fontSize:10,color:"#555"}}>
                      목표: {p.goal.toFixed(1)}kg ({cfg.goalPercent}% 감량) | 베팅: {fmt(p.bet)}원
                    </div>
                  </div>
                  <div style={{flex:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Ring pct={Math.max(0,p.prog)} size={62} color={COLORS[idx%COLORS.length]}/>
                      <div style={{position:"absolute",fontSize:12,fontWeight:700}}>{Math.round(Math.max(0,p.prog))}%</div>
                    </div>
                    <Sparkline data={p.ws} color={COLORS[idx%COLORS.length]} width={120} height={36}/>
                  </div>
                </div>
              </div>
            ))
          )}

          {!state.started&&parts.length>0&&(
            <div style={{textAlign:"center",padding:14}}>
              <button onClick={startGame} style={{...S.btn,...S.pri,fontSize:16,padding:"12px 36px"}}>🥊 게임 시작!</button>
              <div style={{fontSize:11,color:"#555",marginTop:6}}>시작하면 12주 로드맵 카운트다운 시작</div>
            </div>
          )}
        </>)}

        {/* ══════ DAILY ROUTINE ══════ */}
        {tab==="routine"&&(<>
          <div style={S.card}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>🗓️ 하루 루틴 타임라인</div>
            <p style={{fontSize:11,color:"#666",margin:"0 0 12px"}}>
              "Ora, Lege et Labora" — 기도하고, 읽고, 일하라
            </p>
            {DAILY_TIMELINE.map((item, i) => {
              const now = new Date();
              const [h,m] = item.time.split(":").map(Number);
              const isPast = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
              const nextItem = DAILY_TIMELINE[i+1];
              const isCurrent = isPast && nextItem && !(now.getHours() > parseInt(nextItem.time) || (now.getHours() === parseInt(nextItem.time) && now.getMinutes() >= parseInt(nextItem.time.split(":")[1])));
              return (
                <div key={i} style={{display:"flex",gap:12,marginBottom:2,padding:"8px 10px",borderRadius:10,
                  background: isCurrent ? "rgba(78,205,196,0.1)" : "transparent",
                  border: isCurrent ? "1px solid rgba(78,205,196,0.2)" : "1px solid transparent",
                  opacity: isPast && !isCurrent ? 0.5 : 1, transition:"all 0.3s"}}>
                  <div style={{width:48,fontSize:11,fontWeight:600,color:isCurrent?"#4ECDC4":"#777",paddingTop:2}}>{item.time}</div>
                  <div style={{width:28,fontSize:16,textAlign:"center"}}>{item.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:isCurrent?700:500,color:isCurrent?"#fff":"#ccc"}}>{item.activity}</div>
                    <div style={{fontSize:10,color:"#666"}}>{item.note}</div>
                  </div>
                  {isCurrent && <div style={{fontSize:9,color:"#4ECDC4",fontWeight:600,alignSelf:"center"}}>NOW</div>}
                </div>
              );
            })}
          </div>

          {/* Fasting Tracker */}
          <div style={{...S.card,...S.glow("#DDA0DD")}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:700}}>⏱️ 간헐적 단식</div>
              <span style={S.badge("#DDA0DD")}>{fastingInfo.name}</span>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {FASTING_PHASES.map((fp, i) => (
                <button key={i}
                  onClick={() => save({...state, fastingPhase: i+1})}
                  style={S.chipBtn((state.fastingPhase||1)===i+1, "#DDA0DD")}>
                  {fp.name}
                </button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
              <div style={{textAlign:"center",padding:8,borderRadius:8,background:"rgba(255,255,255,0.03)"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#DDA0DD"}}>{fastingInfo.fastHrs}h</div>
                <div style={{fontSize:10,color:"#888"}}>단식 시간</div>
              </div>
              <div style={{textAlign:"center",padding:8,borderRadius:8,background:"rgba(255,255,255,0.03)"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#4ECDC4"}}>{fastingInfo.eatHrs}h</div>
                <div style={{fontSize:10,color:"#888"}}>식사 창</div>
              </div>
              <div style={{textAlign:"center",padding:8,borderRadius:8,background:"rgba(255,255,255,0.03)"}}>
                <div style={{fontSize:14,fontWeight:600,color:"#FFEAA7"}}>{fastingInfo.cutoff}</div>
                <div style={{fontSize:10,color:"#888"}}>마지막 식사</div>
              </div>
            </div>
            <div onClick={togFasting}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,cursor:"pointer",
                background:todayLog.fasting?"rgba(78,205,196,0.1)":"rgba(255,255,255,0.02)"}}>
              <div style={S.check(todayLog.fasting,"#DDA0DD")}>{todayLog.fasting&&"✓"}</div>
              <span style={{fontSize:13,color:todayLog.fasting?"#DDA0DD":"#999"}}>오늘 단식 실천 완료</span>
            </div>
            <div style={{fontSize:10,color:"#555",marginTop:6}}>※ 단식 중 허용: 물, 블랙커피, 무가당 차 | 목장 노동일은 유연하게 조절</div>
          </div>

          {/* Water & Sleep */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={S.card}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>💧 수분 섭취</div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {Array.from({length:8}).map((_,i) => (
                  <div key={i} onClick={() => setWater(i+1 === todayLog.water ? i : i+1)}
                    style={{width:28,height:28,borderRadius:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                      background:i<(todayLog.water||0)?"rgba(69,183,209,0.2)":"rgba(255,255,255,0.03)",
                      border:i<(todayLog.water||0)?"1px solid rgba(69,183,209,0.3)":"1px solid rgba(255,255,255,0.06)",
                      transition:"all 0.2s"}}>
                    {i<(todayLog.water||0)?"💧":"○"}
                  </div>
                ))}
              </div>
              <div style={{fontSize:10,color:"#888",marginTop:4}}>{todayLog.water||0}/8잔 (2L 목표)</div>
            </div>
            <div style={S.card}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>😴 수면</div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {[5,6,7,8,9].map(h => (
                  <button key={h} onClick={() => setSleep(h)}
                    style={S.chipBtn(todayLog.sleep===h, "#96CEB4")}>
                    {h}시간
                  </button>
                ))}
              </div>
              <div style={{fontSize:10,color:"#888",marginTop:4}}>
                {todayLog.sleep ? `✓ ${todayLog.sleep}시간 ${todayLog.sleep>=7?"👍":"⚠️ 부족"}` : "기록 안됨"}
              </div>
            </div>
          </div>

          {/* Ranch Work */}
          <div style={{...S.card,...S.glow("#98D8C8")}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>🐄 목장 활동 기록</div>
            <p style={{fontSize:10,color:"#666",margin:"0 0 10px"}}>고지대(1,000m) 효과: 평지 대비 약 10~15% 추가 칼로리 소모</p>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
              {RANCH_ACTIVITIES.map((ra, i) => (
                <button key={i} onClick={() => addRanchWork(ra.name)}
                  style={{...S.btn,...S.gho,padding:"6px 10px",fontSize:11}}>
                  {ra.icon} {ra.name}
                </button>
              ))}
            </div>
            {(todayLog.ranchWork || []).length > 0 && (
              <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:8}}>
                {(todayLog.ranchWork || []).map((rw, i) => (
                  <div key={i} style={{fontSize:11,color:"#aaa",padding:"3px 0"}}>
                    <span style={{color:"#98D8C8",fontWeight:600}}>{rw.time}</span> — {rw.activity}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}

        {/* ══════ MEAL TRACKER ══════ */}
        {tab==="meal"&&(<>
          <div style={S.card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:16,fontWeight:700}}>🍽️ 오늘의 식단</div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>setMealType("workout")} style={S.chipBtn(mealType==="workout","#4ECDC4")}>운동일</button>
                <button onClick={()=>setMealType("rest")} style={S.chipBtn(mealType==="rest","#FF6B6B")}>비운동일</button>
              </div>
            </div>

            {/* Daily targets */}
            <div style={{marginBottom:14}}>
              <MiniBar value={estimatedCal} max={MEAL_PLAN[mealType].targetCal} color="#4ECDC4" label="칼로리" unit="kcal"/>
              <MiniBar value={estimatedProtein} max={MEAL_PLAN[mealType].targetProtein} color="#FF6B6B" label="단백질" unit="g"/>
            </div>

            {/* Meal cards */}
            {MEAL_PLAN[mealType].meals.map((meal, idx) => {
              const checked = todayMeals[idx];
              return (
                <div key={idx} style={{...S.card, padding:14, marginBottom:8, ...S.glow(checked?"#4ECDC4":"#444"),
                  opacity: checked ? 0.7 : 1}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}} onClick={() => togMeal(idx)}>
                    <div style={S.check(checked)}>{checked&&"✓"}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14,color:checked?"#4ECDC4":"#ddd"}}>{meal.name}</div>
                      <div style={{fontSize:11,color:"#777"}}>{meal.time} | {meal.cal}kcal | 단백질 {meal.protein}g</div>
                    </div>
                  </div>
                  <div style={{paddingLeft:32}}>
                    {meal.items.map((item, ii) => (
                      <div key={ii} style={{fontSize:11,color:"#999",padding:"2px 0",lineHeight:1.5}}>
                        • {item}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Nutrition targets */}
          <div style={S.card}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>📊 일일 영양소 목표</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                {label:"단백질", target:"120~140g", ratio:"30~35%", color:"#FF6B6B", note:"근육 유지/회복"},
                {label:"탄수화물", target:"170~200g", ratio:"35~40%", color:"#4ECDC4", note:"복합 탄수 위주"},
                {label:"지방", target:"55~65g", ratio:"25~30%", color:"#FFEAA7", note:"호르몬 균형"},
                {label:"식이섬유", target:"25~30g", ratio:"-", color:"#96CEB4", note:"포만감/장 건강"},
              ].map((n,i)=>(
                <div key={i} style={{padding:10,borderRadius:10,background:"rgba(255,255,255,0.03)",border:`1px solid ${n.color}18`}}>
                  <div style={{fontSize:12,fontWeight:700,color:n.color}}>{n.label}</div>
                  <div style={{fontSize:15,fontWeight:700,marginTop:2}}>{n.target}</div>
                  <div style={{fontSize:10,color:"#777"}}>{n.ratio !== "-" ? `(${n.ratio})` : ""} {n.note}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Avoid list */}
          <div style={{...S.card,...S.glow("#FF6B6B")}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:"#FF6B6B"}}>🚫 피해야 할 음식</div>
            {[
              ["흰 밀가루","→ 통밀빵, 현미"],
              ["설탕/단 음료","→ 물, 블랙커피"],
              ["과도한 음주","→ 주 1~2회, 2잔 이내"],
              ["야식 (21시 이후)","→ 공복 유지"],
              ["가공육 (햄/소시지)","→ 닭가슴살, 생선, 두부"],
            ].map(([bad, alt], i) => (
              <div key={i} style={{fontSize:11,color:"#999",padding:"3px 0",display:"flex",gap:8}}>
                <span style={{color:"#FF6B6B"}}>✕ {bad}</span>
                <span style={{color:"#4ECDC4"}}>{alt}</span>
              </div>
            ))}
          </div>
        </>)}

        {/* ══════ EXERCISE ══════ */}
        {tab==="exercise"&&(<>
          {/* Weekly schedule */}
          <div style={S.card}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>💪 주간 운동 스케줄</div>
            <div style={{fontSize:11,color:"#666",marginBottom:12}}>이번 주 운동 {weekExerciseStats}일 완료</div>
            <div style={{display:"flex",gap:4,marginBottom:14}}>
              {WEEKLY_SCHEDULE.map((ws, i) => (
                <button key={i} onClick={() => setExerciseDay(i)}
                  style={{
                    flex:1, padding:"8px 2px", borderRadius:8, cursor:"pointer",
                    background: i===exerciseDay ? `${ws.color}22` : i===todayDayIdx ? "rgba(255,255,255,0.06)" : "transparent",
                    border: i===exerciseDay ? `1px solid ${ws.color}44` : i===todayDayIdx ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                    transition:"all 0.2s"
                  }}>
                  <div style={{fontSize:12,fontWeight:i===exerciseDay?700:400,color:i===exerciseDay?ws.color:i===todayDayIdx?"#ccc":"#666"}}>{ws.day}</div>
                  <div style={{fontSize:14,marginTop:2}}>{ws.icon}</div>
                </button>
              ))}
            </div>

            {/* Selected day details */}
            {(() => {
              const ws = WEEKLY_SCHEDULE[exerciseDay];
              return (
                <div style={{...S.card,...S.glow(ws.color),padding:14,marginBottom:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14,color:ws.color}}>{ws.icon} {ws.type}</div>
                      <div style={{fontSize:11,color:"#888"}}>{ws.duration}분 | {ws.intensity}</div>
                    </div>
                    {ws.duration > 0 && <span style={S.badge(ws.color)}>{ws.duration}분</span>}
                  </div>

                  {/* Exercise list */}
                  {ws.exercises.map((ex, ei) => {
                    const isToday = exerciseDay === todayDayIdx;
                    const checked = isToday && todayExercises[ei];
                    return (
                      <div key={ei}
                        onClick={() => isToday && togExercise(ei)}
                        style={{
                          display:"flex", alignItems:"center", gap:10,
                          padding:"9px 10px", borderRadius:8, marginBottom:4, cursor: isToday ? "pointer" : "default",
                          background: checked ? "rgba(78,205,196,0.08)" : "rgba(255,255,255,0.02)",
                          transition:"all 0.2s"
                        }}>
                        {isToday && <div style={S.check(checked, ws.color)}>{checked && "✓"}</div>}
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:600,color:checked?"#4ECDC4":"#ddd",
                            textDecoration:checked?"line-through":"none"}}>{ex.name}</div>
                          <div style={{fontSize:10,color:"#777"}}>{ex.note}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:12,fontWeight:600,color:ws.color}}>{ex.sets}</div>
                          {ex.rest !== "-" && <div style={{fontSize:9,color:"#666"}}>휴식 {ex.rest}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Zone 2 Guide */}
          <div style={{...S.card,...S.glow("#45B7D1")}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:6,color:"#45B7D1"}}>❤️ Zone 2 유산소 가이드</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                ["목표 심박수","120~135 bpm"],
                ["추천 운동","걷기/조깅/자전거/수영"],
                ["주당 횟수","최소 3회 (이상 4~5회)"],
                ["1회 시간","30~60분"],
              ].map(([lb,val],i)=>(
                <div key={i} style={{padding:8,borderRadius:8,background:"rgba(255,255,255,0.03)"}}>
                  <div style={{fontSize:10,color:"#888"}}>{lb}</div>
                  <div style={{fontSize:12,fontWeight:600}}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:10,color:"#666",marginTop:8}}>
              ※ 태백(1,000m 고지대) 효과: 산소 소비↑ → 자연 칼로리 소모 증가. 무리하지 않되 이 지리적 이점을 활용하세요.
            </div>
          </div>
        </>)}

        {/* ══════ RECORD ══════ */}
        {tab==="rec"&&(<>
          <div style={S.card}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:14}}>⚖️ 오늘의 체중 기록</div>
            {parts.length===0?(
              <div style={{color:"#888",textAlign:"center",padding:16}}>먼저 관리 탭에서 참가자를 등록하세요.</div>
            ):(
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:"1 1 160px"}}>
                  <label style={S.lbl}>참가자</label>
                  <select value={rName} onChange={e=>setRName(e.target.value)} style={{...S.inp,cursor:"pointer"}}>
                    <option value="">선택</option>
                    {parts.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div style={{flex:"1 1 120px"}}>
                  <label style={S.lbl}>오늘 체중 (kg)</label>
                  <input type="number" step="0.1" placeholder="72.5" value={rWeight} onChange={e=>setRWeight(e.target.value)} style={S.inp}/>
                </div>
                <button onClick={doRec} disabled={!rName||!rWeight} style={{...S.btn,...S.pri,height:40,opacity:(!rName||!rWeight)?0.5:1}}>✓ 기록</button>
              </div>
            )}
          </div>

          {board.map((p,idx)=>(
            <div key={p.id} style={S.card}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:COLORS[idx%COLORS.length]}}>{p.name}의 기록</div>
              <Sparkline data={p.ws} color={COLORS[idx%COLORS.length]} width={280} height={65}/>
              <div style={{marginTop:10,maxHeight:180,overflowY:"auto"}}>
                <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                  <thead><tr style={{color:"#777"}}>
                    <th style={{padding:"5px 8px",textAlign:"left",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>날짜</th>
                    <th style={{padding:"5px 8px",textAlign:"right",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>체중</th>
                    <th style={{padding:"5px 8px",textAlign:"right",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>변화</th>
                  </tr></thead>
                  <tbody>
                    {[...p.recs].sort((a,b)=>b.d.localeCompare(a.d)).map((r,i,arr)=>{
                      const prev=arr[i+1]; const diff=prev?r.w-prev.w:0;
                      return (
                        <tr key={r.d} style={{borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                          <td style={{padding:"5px 8px"}}>{r.d}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600}}>{r.w.toFixed(1)} kg</td>
                          <td style={{padding:"5px 8px",textAlign:"right",color:diff<=0?"#4ECDC4":"#FF6B6B",fontWeight:600}}>
                            {diff!==0?`${diff>0?"+":""}${diff.toFixed(1)}`:"-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>)}

        {/* ══════ MISSION ══════ */}
        {tab==="mis"&&(<>
          <div style={S.card}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>🎯 주간 미션 ({curWeek}주차)</div>
            <p style={{fontSize:11,color:"#666",margin:"0 0 14px"}}>미션 완료 시 체크! 전체 달성 시 보너스 포인트</p>
            {parts.map((p,pi)=>{
              const wm=MISSIONS_V11[Math.min(curWeek-1,MISSIONS_V11.length-1)]||MISSIONS_V11[0];
              const done=wm.filter((_,mi)=>p.mis[`w${curWeek}-m${mi}`]).length;
              const allDone=done===wm.length;
              return (
                <div key={p.id} style={{...S.card,...S.glow(COLORS[pi%COLORS.length]),padding:14,marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontWeight:700,color:COLORS[pi%COLORS.length]}}>{p.name}</span>
                    <span style={S.badge(allDone?"#4ECDC4":"#888")}>{done}/{wm.length} 완료{allDone?" 🎯":""}</span>
                  </div>
                  {wm.map((m,mi)=>{
                    const ck=p.mis[`w${curWeek}-m${mi}`];
                    return (
                      <div key={mi} onClick={()=>togMis(p.id,curWeek,mi)}
                        style={{display:"flex",alignItems:"center",gap:9,padding:"7px 9px",borderRadius:7,marginBottom:3,cursor:"pointer",background:ck?"rgba(78,205,196,0.08)":"rgba(255,255,255,0.02)",transition:"all 0.2s"}}>
                        <div style={S.check(ck)}>{ck&&"✓"}</div>
                        <span style={{fontSize:12,color:ck?"#4ECDC4":"#bbb",textDecoration:ck?"line-through":"none"}}>{m}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {parts.length===0&&<div style={{color:"#888",textAlign:"center",padding:16}}>참가자를 먼저 등록하세요.</div>}
          </div>
        </>)}

        {/* ══════ RANKING ══════ */}
        {tab==="rank"&&(<>
          <div style={S.card}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:14}}>🏆 리더보드</div>
            {board.length===0?(
              <div style={{color:"#888",textAlign:"center",padding:16}}>참가자가 없습니다.</div>
            ):(
              board.map((p,idx)=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 14px",borderRadius:10,marginBottom:7,
                  background:idx===0?"linear-gradient(135deg,rgba(255,215,0,0.12),rgba(255,215,0,0.04))":"rgba(255,255,255,0.025)",
                  border:idx===0?"1px solid rgba(255,215,0,0.25)":"1px solid rgba(255,255,255,0.04)"}}>
                  <div style={{width:32,height:32,borderRadius:"50%",
                    background:idx===0?"linear-gradient(135deg,#FFD700,#FFA500)":idx===1?"linear-gradient(135deg,#C0C0C0,#A0A0A0)":idx===2?"linear-gradient(135deg,#CD7F32,#B87333)":"rgba(255,255,255,0.08)",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:idx<3?"#fff":"#777"}}>
                    {idx+1}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14}}>{p.name} {p.done&&"🎉"}</div>
                    <div style={{fontSize:10,color:"#777"}}>{p.sw}kg → {p.cur.toFixed(1)}kg | 감량 {p.lossR.toFixed(1)}%</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:18,fontWeight:800,color:COLORS[idx%COLORS.length]}}>{Math.round(Math.max(0,p.prog))}%</div>
                    <div style={{fontSize:9,color:"#777"}}>달성률</div>
                  </div>
                  <div style={{textAlign:"right",minWidth:36}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#FFEAA7"}}>{p.streak>0?`🔥${p.streak}`:"-"}</div>
                    <div style={{fontSize:9,color:"#777"}}>스트릭</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {board.length>0&&(
            <div style={S.card}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:"#FFD700"}}>💰 예상 상금 분배</div>
              <div style={{fontSize:12,color:"#999",lineHeight:1.7}}>
                {cfg.rule==="winner-takes-all"?(
                  <>
                    <div>현재 1위 <strong style={{color:"#4ECDC4"}}>{board[0]?.name}</strong> 님이 종료 시 목표 달성하면</div>
                    <div style={{fontSize:20,fontWeight:800,color:"#FFD700",margin:"6px 0"}}>{fmt(totalPot)}원 독식!</div>
                    <div style={{fontSize:10,color:"#666"}}>*복수 달성 시: 1위 70% ({fmt(Math.round(totalPot*0.7))}원) / 2위 30% ({fmt(Math.round(totalPot*0.3))}원)</div>
                  </>
                ):(
                  <div>목표 달성자들에게 달성률 비례로 분배됩니다. 총 상금: <strong style={{color:"#FFD700"}}>{fmt(totalPot)}원</strong></div>
                )}
              </div>
            </div>
          )}
        </>)}

        {/* ══════ MANAGE ══════ */}
        {tab==="mgmt"&&(<>
          <div style={S.card}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:14}}>➕ 참가자 등록</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{flex:"1 1 120px"}}><label style={S.lbl}>이름</label><input value={fName} onChange={e=>setFName(e.target.value)} placeholder="박요셉" style={S.inp}/></div>
              <div style={{flex:"1 1 100px"}}><label style={S.lbl}>시작 체중(kg)</label><input type="number" step="0.1" value={fWeight} onChange={e=>setFWeight(e.target.value)} placeholder="75.5" style={S.inp}/></div>
              <div style={{flex:"1 1 100px"}}><label style={S.lbl}>베팅 금액(원)</label><input type="number" step="10000" value={fBet} onChange={e=>setFBet(e.target.value)} placeholder="50000" style={S.inp}/></div>
              <button onClick={addPart} style={{...S.btn,...S.pri,height:38}}>➕ 등록</button>
            </div>
            <div style={{fontSize:10,color:"#555",marginTop:6}}>* 목표: 시작 체중의 {cfg.goalPercent}% 감량 ({cfg.durationWeeks}주 프로그램)</div>
          </div>

          <div style={S.card}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>현재 참가자 ({parts.length}명)</div>
            {parts.length===0?(
              <div style={{color:"#888",textAlign:"center",padding:14}}>아직 등록된 참가자가 없습니다.</div>
            ):(
              parts.map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 10px",borderRadius:7,marginBottom:3,background:"rgba(255,255,255,0.025)"}}>
                  <div>
                    <span style={{fontWeight:600}}>{p.name}</span>
                    <span style={{fontSize:11,color:"#777",marginLeft:6}}>{p.sw}kg → 목표 {(p.sw*(1-cfg.goalPercent/100)).toFixed(1)}kg | {fmt(p.bet)}원</span>
                  </div>
                  {!state.started&&<button onClick={()=>rmPart(p.id)} style={{...S.btn,...S.gho,padding:"3px 8px",fontSize:11}}>삭제</button>}
                </div>
              ))
            )}
          </div>

          <div style={S.card}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>⚙️ 게임 설정</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><label style={S.lbl}>기간(주)</label>
                <select value={cfg.durationWeeks} onChange={e=>updCfg("durationWeeks",parseInt(e.target.value))} style={S.inp} disabled={state.started}>
                  {[4,6,8,12,16].map(w=><option key={w} value={w}>{w}주</option>)}
                </select>
              </div>
              <div><label style={S.lbl}>감량 목표(%)</label>
                <select value={cfg.goalPercent} onChange={e=>updCfg("goalPercent",parseInt(e.target.value))} style={S.inp} disabled={state.started}>
                  {[4,5,6,8,10].map(p=><option key={p} value={p}>{p}%</option>)}
                </select>
              </div>
              <div><label style={S.lbl}>상금 룰</label>
                <select value={cfg.rule} onChange={e=>updCfg("rule",e.target.value)} style={S.inp} disabled={state.started}>
                  <option value="winner-takes-all">승자 독식</option>
                  <option value="proportional">비례 배분</option>
                </select>
              </div>
            </div>
          </div>

          {/* Body Composition Reference */}
          <div style={{...S.card,...S.glow("#45B7D1")}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>📋 ACCUNIQ BC720 체성분 기준</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {[
                ["체중","75.5kg → 69.3kg","#FF6B6B"],
                ["BMI","27.3 → 25.0 이하","#FFEAA7"],
                ["골격근량","32.0kg 유지","#4ECDC4"],
                ["체지방률","24.3% → 15~20%","#FF6B6B"],
                ["내장지방","102cm² → 80 이하","#DDA0DD"],
                ["복부비만율","0.90 → 0.85 이하","#45B7D1"],
              ].map(([lb,val,c],i) => (
                <div key={i} style={{padding:8,borderRadius:8,background:"rgba(255,255,255,0.02)",borderLeft:`3px solid ${c}`}}>
                  <div style={{fontSize:10,color:"#888"}}>{lb}</div>
                  <div style={{fontSize:11,fontWeight:600}}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:10,color:"#555",marginTop:8}}>측정일: 2026.02.12 | 기초대사량: 1,605kcal | 진단: 근육 있는 과체중</div>
          </div>

          <div style={{textAlign:"center",padding:14}}>
            <button onClick={resetAll} style={{...S.btn,...S.dan}}>🗑️ 전체 초기화</button>
          </div>
        </>)}

        {/* Rules */}
        {tab==="dash" && (
          <div style={{...S.card,marginTop:6}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>📜 게임 규칙</div>
            <div style={{fontSize:11,color:"#888",lineHeight:1.7}}>
              {cfg.rule==="winner-takes-all"
                ?"① 승자 독식: 목표 달성자 중 최다 감량 1인이 전체 상금 획득 ② 복수 달성 시: 1위 70% / 2위 30% ③ 전원 실패 시: 상금으로 건강식 회식 ④ 기록 미제출 3일 연속: 벌금 10,000원 추가"
                :"① 비례 배분: 달성자들이 달성률 비례로 상금 분배 ② 전원 달성 시: 각자 환급 + 보너스 회식 ③ 전원 실패 시: 건강식 회식 ④ 기록 미제출 3일 연속: 벌금 10,000원 추가"}
            </div>
          </div>
        )}

        <div style={{textAlign:"center",padding:"20px 0",fontSize:10,color:"#333"}}>
          배틀 다이어트 v1.1 | MooMoo Ranch Edition 🐄 | Ora, Lege et Labora
        </div>
      </div>
    </div>
  );
}
