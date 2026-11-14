import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Eye,
  Maximize2,
  Minimize2,
  Moon,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Video,
  Wifi,
} from 'lucide-react';
import { useCfos } from '../context/CfosContext';
import { ClubId } from '../types/cfos';

export interface ClubCameraFeed {
  id: string;
  code: string;
  name: string;
  clubId: ClubId;
  clubLabel: string;
  clubShort: 'Center' | 'Place';
  zone: string;
  ipAddress: string;
  protocol: string;
  resolution: string;
  fps: number;
  bitrateMbps: number;
  sceneType: 'turnstile' | 'weights' | 'cardio' | 'studio' | 'parking';
  occupantsCount: number;
  maxZoneCapacity: number;
  heitzCorrelation: string;
  status: 'online' | 'recording';
  defaultIrMode?: boolean;
}

export const CLUB_CAMERAS: ClubCameraFeed[] = [
  {
    id: 'cam-center-01',
    code: 'CAM-01',
    name: 'Accueil & Tourniquets Tripodes Heitz',
    clubId: 'carre-de-soie',
    clubLabel: 'C.Fitness Center · Carré de Soie',
    clubShort: 'Center',
    zone: 'Entrée Principale & Caisse TPV',
    ipAddress: '10.10.0.61',
    protocol: 'RTSP / WebRTC H.265+ PoE',
    resolution: '4K UHD (3840×2160)',
    fps: 25,
    bitrateMbps: 6.4,
    sceneType: 'turnstile',
    occupantsCount: 6,
    maxZoneCapacity: 25,
    heitzCorrelation: 'Portillon #1 · Dernier badge RFID validé il y a 8 s',
    status: 'recording',
  },
  {
    id: 'cam-center-02',
    code: 'CAM-02',
    name: 'Plateau Musculation & Racks Olympiques',
    clubId: 'carre-de-soie',
    clubLabel: 'C.Fitness Center · Carré de Soie',
    clubShort: 'Center',
    zone: 'Zone Force & Poids Libres',
    ipAddress: '10.10.0.62',
    protocol: 'RTSP / WebRTC H.265+ PoE',
    resolution: '4K UHD (3840×2160)',
    fps: 25,
    bitrateMbps: 7.1,
    sceneType: 'weights',
    occupantsCount: 38,
    maxZoneCapacity: 55,
    heitzCorrelation: 'FMI Zone Force : 69% d’occupation nominale',
    status: 'recording',
  },
  {
    id: 'cam-center-03',
    code: 'CAM-03',
    name: 'Espace Cardio & Biocircuit Technogym',
    clubId: 'carre-de-soie',
    clubLabel: 'C.Fitness Center · Carré de Soie',
    clubShort: 'Center',
    zone: 'Cardio Excite & Bornes Unity',
    ipAddress: '10.10.0.63',
    protocol: 'RTSP / WebRTC H.265+ PoE',
    resolution: '4K UHD (3840×2160)',
    fps: 25,
    bitrateMbps: 6.8,
    sceneType: 'cardio',
    occupantsCount: 24,
    maxZoneCapacity: 40,
    heitzCorrelation: '18 machines Technogym connectées actives',
    status: 'recording',
  },
  {
    id: 'cam-center-04',
    code: 'CAM-04',
    name: 'Studio Cours Collectifs & Bilan Checkup',
    clubId: 'carre-de-soie',
    clubLabel: 'C.Fitness Center · Carré de Soie',
    clubShort: 'Center',
    zone: 'Studio LesMills & Salle Bilan',
    ipAddress: '10.10.0.64',
    protocol: 'RTSP / WebRTC H.265+ PoE',
    resolution: '4K UHD (3840×2160)',
    fps: 25,
    bitrateMbps: 6.2,
    sceneType: 'studio',
    occupantsCount: 24,
    maxZoneCapacity: 30,
    heitzCorrelation: 'Cours BodyPump en cours (24/30 inscrits)',
    status: 'recording',
  },
  {
    id: 'cam-place-05',
    code: 'CAM-05',
    name: 'Accueil & Portillons RFID/BLE Heitz',
    clubId: 'beynost',
    clubLabel: 'C.Fitness Place · Beynost ZAC',
    clubShort: 'Place',
    zone: 'Réception, TPV & Sas PMR',
    ipAddress: '10.20.0.61',
    protocol: 'RTSP / WebRTC H.265+ PoE',
    resolution: '4K UHD (3840×2160)',
    fps: 25,
    bitrateMbps: 6.5,
    sceneType: 'turnstile',
    occupantsCount: 5,
    maxZoneCapacity: 25,
    heitzCorrelation: 'Sas Beynost #1 · Passage QR Essai validé il y a 14 s',
    status: 'recording',
  },
  {
    id: 'cam-place-06',
    code: 'CAM-06',
    name: 'Plateau Musculation & Haltérophilie',
    clubId: 'beynost',
    clubLabel: 'C.Fitness Place · Beynost ZAC',
    clubShort: 'Place',
    zone: 'Machines Guidées PureStrength',
    ipAddress: '10.20.0.62',
    protocol: 'RTSP / WebRTC H.265+ PoE',
    resolution: '4K UHD (3840×2160)',
    fps: 25,
    bitrateMbps: 7.3,
    sceneType: 'weights',
    occupantsCount: 31,
    maxZoneCapacity: 50,
    heitzCorrelation: 'FMI Zone Musculation : 62% d’occupation',
    status: 'recording',
  },
  {
    id: 'cam-place-07',
    code: 'CAM-07',
    name: 'Zone Cross-Training & Cardio Technogym',
    clubId: 'beynost',
    clubLabel: 'C.Fitness Place · Beynost ZAC',
    clubShort: 'Place',
    zone: 'Cage Rig Fonctionnel & Rameurs',
    ipAddress: '10.20.0.63',
    protocol: 'RTSP / WebRTC H.265+ PoE',
    resolution: '4K UHD (3840×2160)',
    fps: 25,
    bitrateMbps: 6.9,
    sceneType: 'cardio',
    occupantsCount: 19,
    maxZoneCapacity: 35,
    heitzCorrelation: 'WOD Small Group Coaché en cours',
    status: 'recording',
  },
  {
    id: 'cam-place-08',
    code: 'CAM-08',
    name: 'Accès Parking & Issue de Secours ERP',
    clubId: 'beynost',
    clubLabel: 'C.Fitness Place · Beynost ZAC',
    clubShort: 'Place',
    zone: 'Parking Adhérents & Issue Sud',
    ipAddress: '10.20.0.64',
    protocol: 'RTSP / WebRTC H.265+ IR Auto',
    resolution: '4K UHD (3840×2160)',
    fps: 25,
    bitrateMbps: 5.8,
    sceneType: 'parking',
    occupantsCount: 3,
    maxZoneCapacity: 60,
    heitzCorrelation: 'Issue ERP verrouillée sous alarme · 0 anomalie',
    status: 'recording',
  },
];

interface SnapshotRecord {
  id: string;
  cameraCode: string;
  cameraName: string;
  clubShort: string;
  timestamp: string;
  ipAddress: string;
}

export function ClubCamerasWallPanel() {
  const { clubFilter, setClubFilter, themeMode, accessEvents } = useCfos();
  const isDark = themeMode === 'dark';

  const [layoutMode, setLayoutMode] = useState<'grid-4' | 'grid-8' | 'focus'>('grid-4');
  const [selectedCameraId, setSelectedCameraId] = useState<string>('cam-center-01');
  const [showMotionOverlay, setShowMotionOverlay] = useState<boolean>(true);
  const [irNightVisionMap, setIrNightVisionMap] = useState<Record<string, boolean>>({});
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [lastCaptureToast, setLastCaptureToast] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowDate(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredCameras = useMemo(() => {
    const base =
      clubFilter === 'all'
        ? CLUB_CAMERAS
        : CLUB_CAMERAS.filter((cam) => cam.clubId === clubFilter);
    if (layoutMode === 'grid-4' && clubFilter === 'all') {
      // Show 2 key cameras from Center + 2 key cameras from Place when in 4-camera grid on "All clubs"
      return [
        CLUB_CAMERAS[0],
        CLUB_CAMERAS[1],
        CLUB_CAMERAS[4],
        CLUB_CAMERAS[5],
      ];
    }
    return base;
  }, [clubFilter, layoutMode]);

  const focusedCamera = useMemo(
    () =>
      CLUB_CAMERAS.find((c) => c.id === selectedCameraId) ??
      filteredCameras[0] ??
      CLUB_CAMERAS[0],
    [selectedCameraId, filteredCameras]
  );

  const formattedTime = nowDate.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const formattedDate = nowDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const latestAccessEvent = accessEvents[0];

  const handleToggleIr = (camId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIrNightVisionMap((prev) => ({
      ...prev,
      [camId]: !prev[camId],
    }));
  };

  const handleCaptureSnapshot = (cam: ClubCameraFeed, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const stamp = `${formattedDate} ${formattedTime}`;
    const record: SnapshotRecord = {
      id: `snap-${Date.now()}`,
      cameraCode: cam.code,
      cameraName: cam.name,
      clubShort: cam.clubShort,
      timestamp: stamp,
      ipAddress: cam.ipAddress,
    };
    setSnapshots((prev) => [record, ...prev.slice(0, 4)]);
    setLastCaptureToast(
      `Capture horodatée enregistrée sur NVR : ${cam.code} (${cam.clubShort}) à ${formattedTime}`
    );
    window.setTimeout(() => {
      setLastCaptureToast((current) =>
        current && current.includes(cam.code) ? null : current
      );
    }, 4000);
  };

  const renderCameraSceneSvg = (cam: ClubCameraFeed, isIr: boolean, tickSec: number) => {
    const pulseOffset = (tickSec % 6) * 3;
    const strokeMain = isIr ? '#34D399' : cam.clubId === 'carre-de-soie' ? '#A78BFA' : '#38BDF8';
    const strokeSecondary = isIr ? '#10B981' : '#94A3B8';

    return (
      <svg
        viewBox="0 0 400 220"
        className="w-full h-full object-cover select-none"
        aria-label={`Flux vidéo ${cam.code} ${cam.name}`}
      >
        <defs>
          <linearGradient id={`bg-${cam.id}`} x1="0" y1="0" x2="1" y2="1">
            {isIr ? (
              <>
                <stop offset="0%" stopColor="#021810" />
                <stop offset="55%" stopColor="#062E22" />
                <stop offset="100%" stopColor="#02130D" />
              </>
            ) : cam.clubId === 'carre-de-soie' ? (
              <>
                <stop offset="0%" stopColor="#0F172A" />
                <stop offset="55%" stopColor="#1E1B4B" />
                <stop offset="100%" stopColor="#111827" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#091526" />
                <stop offset="55%" stopColor="#0F2942" />
                <stop offset="100%" stopColor="#0F172A" />
              </>
            )}
          </linearGradient>

          <pattern
            id={`grid-${cam.id}`}
            width="25"
            height="25"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 25 0 L 0 0 0 25"
              fill="none"
              stroke={isIr ? 'rgba(16,185,129,0.10)' : 'rgba(148,163,184,0.08)'}
              strokeWidth="0.7"
            />
          </pattern>
        </defs>

        {/* Background room perspective */}
        <rect width="400" height="220" fill={`url(#bg-${cam.id})`} />
        <rect width="400" height="220" fill={`url(#grid-${cam.id})`} />

        {/* Perspective architectural lines (ceiling + floor) */}
        <line
          x1="0"
          y1="175"
          x2="400"
          y2="175"
          stroke={strokeSecondary}
          strokeOpacity="0.3"
          strokeWidth="1"
        />
        <line
          x1="60"
          y1="45"
          x2="0"
          y2="0"
          stroke={strokeSecondary}
          strokeOpacity="0.25"
          strokeWidth="1"
        />
        <line
          x1="340"
          y1="45"
          x2="400"
          y2="0"
          stroke={strokeSecondary}
          strokeOpacity="0.25"
          strokeWidth="1"
        />
        <line
          x1="60"
          y1="145"
          x2="0"
          y2="220"
          stroke={strokeSecondary}
          strokeOpacity="0.25"
          strokeWidth="1"
        />
        <line
          x1="340"
          y1="145"
          x2="400"
          y2="220"
          stroke={strokeSecondary}
          strokeOpacity="0.25"
          strokeWidth="1"
        />
        <rect
          x="60"
          y="45"
          width="280"
          height="100"
          fill="none"
          stroke={strokeSecondary}
          strokeOpacity="0.22"
          strokeWidth="1"
        />

        {/* LED Ceiling Neon Bars */}
        <line
          x1="110"
          y1="22"
          x2="175"
          y2="22"
          stroke={isIr ? '#6EE7B7' : '#E2E8F0'}
          strokeOpacity="0.65"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <line
          x1="225"
          y1="22"
          x2="290"
          y2="22"
          stroke={isIr ? '#6EE7B7' : '#E2E8F0'}
          strokeOpacity="0.65"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Scene-specific gym architectures */}
        {cam.sceneType === 'turnstile' && (
          <g>
            {/* Reception desk */}
            <rect
              x="72"
              y="105"
              width="85"
              height="42"
              rx="4"
              fill={isIr ? 'rgba(6,78,59,0.7)' : 'rgba(30,41,59,0.85)'}
              stroke={strokeMain}
              strokeWidth="1.5"
            />
            <text
              x="84"
              y="128"
              fontSize="8"
              fontWeight="bold"
              fill={isIr ? '#A7F3D0' : '#E2E8F0'}
            >
              ACCUEIL · TPV
            </text>

            {/* Heitz Turnstile Gates */}
            <rect
              x="195"
              y="112"
              width="28"
              height="48"
              rx="3"
              fill="rgba(15,23,42,0.9)"
              stroke={strokeMain}
              strokeWidth="1.5"
            />
            <rect
              x="255"
              y="112"
              width="28"
              height="48"
              rx="3"
              fill="rgba(15,23,42,0.9)"
              stroke={strokeMain}
              strokeWidth="1.5"
            />
            {/* Tripod barrier arms */}
            <line
              x1="223"
              y1="130"
              x2="255"
              y2={130 - (tickSec % 2 === 0 ? 0 : 8)}
              stroke="#10B981"
              strokeWidth="2.5"
            />
            <circle cx="209" cy="122" r="4" fill="#10B981" />
            <circle cx="269" cy="122" r="4" fill="#10B981" />
          </g>
        )}

        {cam.sceneType === 'weights' && (
          <g>
            {/* Olympic Power Racks */}
            {[85, 165, 245].map((xPos, idx) => (
              <g key={xPos}>
                <rect
                  x={xPos}
                  y="72"
                  width="52"
                  height="80"
                  fill="none"
                  stroke={strokeMain}
                  strokeWidth="2"
                />
                {/* Barbell */}
                <line
                  x1={xPos - 8}
                  y1={105 + ((idx + tickSec) % 3) * 3}
                  x2={xPos + 60}
                  y2={105 + ((idx + tickSec) % 3) * 3}
                  stroke="#F59E0B"
                  strokeWidth="2.5"
                />
                <circle
                  cx={xPos - 4}
                  cy={105 + ((idx + tickSec) % 3) * 3}
                  r="6"
                  fill="#475569"
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                />
                <circle
                  cx={xPos + 56}
                  cy={105 + ((idx + tickSec) % 3) * 3}
                  r="6"
                  fill="#475569"
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                />
              </g>
            ))}
          </g>
        )}

        {cam.sceneType === 'cardio' && (
          <g>
            {/* Row of Technogym Treadmills / Bikes */}
            {[75, 135, 195, 255, 310].map((xPos, idx) => (
              <g key={xPos}>
                <polygon
                  points={`${xPos},155 ${xPos + 36},155 ${xPos + 28},125 ${xPos - 6},125`}
                  fill="rgba(30,41,59,0.85)"
                  stroke={strokeMain}
                  strokeWidth="1.4"
                />
                <rect
                  x={xPos + 4}
                  y="96"
                  width="20"
                  height="15"
                  rx="2"
                  fill="#0F172A"
                  stroke={idx % 2 === 0 ? '#38BDF8' : '#10B981'}
                  strokeWidth="1.4"
                />
              </g>
            ))}
          </g>
        )}

        {cam.sceneType === 'studio' && (
          <g>
            {/* Instructor podium + studio mirrors */}
            <rect
              x="95"
              y="60"
              width="210"
              height="55"
              rx="4"
              fill="rgba(30,41,59,0.55)"
              stroke={strokeMain}
              strokeWidth="1.5"
            />
            <text
              x="145"
              y="90"
              fontSize="10"
              fontWeight="bold"
              fill={isIr ? '#6EE7B7' : '#C4B5FD'}
            >
              STUDIO LESMILLS · LIVE
            </text>
            {/* Step platforms */}
            {[95, 150, 205, 260].map((xPos) => (
              <rect
                key={xPos}
                x={xPos}
                y="145"
                width="36"
                height="10"
                rx="2"
                fill="#EC4899"
                fillOpacity="0.7"
              />
            ))}
          </g>
        )}

        {cam.sceneType === 'parking' && (
          <g>
            {/* Parking bays & Emergency Exit door */}
            <rect
              x="290"
              y="72"
              width="42"
              height="75"
              rx="2"
              fill="rgba(6,78,59,0.55)"
              stroke="#10B981"
              strokeWidth="2"
            />
            <rect x="298" y="60" width="26" height="8" rx="1" fill="#10B981" />
            <line
              x1="70"
              y1="175"
              x2="120"
              y2="145"
              stroke="#F59E0B"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
            <line
              x1="160"
              y1="175"
              x2="210"
              y2="145"
              stroke="#F59E0B"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </g>
        )}

        {/* AI / FMI Motion Detection Bounding Boxes (Anonymized RGPD Silhouettes) */}
        {showMotionOverlay && (
          <g>
            <g transform={`translate(${115 + pulseOffset}, 88)`}>
              <rect
                x="0"
                y="0"
                width="36"
                height="68"
                rx="4"
                fill="rgba(16,185,129,0.08)"
                stroke="#10B981"
                strokeWidth="1.2"
                strokeDasharray="4 2"
              />
              <circle cx="18" cy="14" r="6" fill="rgba(16,185,129,0.45)" />
              <rect
                x="9"
                y="23"
                width="18"
                height="32"
                rx="5"
                fill="rgba(16,185,129,0.35)"
              />
              <text x="2" y="-4" fontSize="7" fontWeight="bold" fill="#34D399">
                FMI #{cam.code.slice(-2)}A
              </text>
            </g>

            {cam.occupantsCount > 4 && (
              <g transform={`translate(${225 - pulseOffset}, 92)`}>
                <rect
                  x="0"
                  y="0"
                  width="34"
                  height="64"
                  rx="4"
                  fill="rgba(56,189,248,0.08)"
                  stroke="#38BDF8"
                  strokeWidth="1.2"
                  strokeDasharray="4 2"
                />
                <circle cx="17" cy="13" r="5.5" fill="rgba(56,189,248,0.45)" />
                <rect
                  x="8"
                  y="21"
                  width="18"
                  height="30"
                  rx="5"
                  fill="rgba(56,189,248,0.35)"
                />
                <text x="2" y="-4" fontSize="7" fontWeight="bold" fill="#38BDF8">
                  FMI #{cam.code.slice(-2)}B
                </text>
              </g>
            )}
          </g>
        )}

        {/* Subtle CCTV Corner Reticles */}
        <path
          d="M 12 26 L 12 14 L 24 14"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1.5"
        />
        <path
          d="M 388 26 L 388 14 L 376 14"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1.5"
        />
        <path
          d="M 12 194 L 12 206 L 24 206"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1.5"
        />
        <path
          d="M 388 194 L 388 206 L 376 206"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1.5"
        />
      </svg>
    );
  };

  const tickSec = nowDate.getSeconds();

  return (
    <section
      aria-label="Mur de vidéosurveillance des caméras du club"
      className={`rounded-2xl border p-4 sm:p-5 space-y-4 transition-colors ${
        isDark
          ? 'bg-[#131826] border-slate-800/90 text-slate-100'
          : 'bg-white border-slate-200/80 text-slate-900 shadow-2xs'
      }`}
    >
      {/* HEADER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Video className="w-4 h-4" />
            </div>
            <h2
              className={`text-base sm:text-lg font-extrabold tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Vue en Direct des Caméras des Clubs (NVR IP PoE Bi-Club)
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              LIVE · 8 CAMÉRAS EN LIGNE
            </span>
          </div>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Flux RTSP / WebRTC locaux isolés sur VLAN Sécurité (Carré de Soie{' '}
            <span className="font-mono font-semibold">10.10.0.61–64</span> &amp; Beynost{' '}
            <span className="font-mono font-semibold">10.20.0.61–64</span>) avec corrélation
            temps réel des portillons Heitz et comptage FMI.
          </p>
        </div>

        {/* CONTROLS: CLUB FILTER + LAYOUT MODE + MOTION OVERLAY */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Club filter buttons synced with global clubFilter */}
          <div
            className={`inline-flex items-center rounded-xl p-1 border text-xs ${
              isDark
                ? 'bg-slate-900/90 border-slate-800'
                : 'bg-slate-100/90 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setClubFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                clubFilter === 'all'
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : isDark
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2 Clubs (8)
            </button>
            <button
              type="button"
              onClick={() => setClubFilter('carre-de-soie')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                clubFilter === 'carre-de-soie'
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : isDark
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Center (4)
            </button>
            <button
              type="button"
              onClick={() => setClubFilter('beynost')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                clubFilter === 'beynost'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : isDark
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Place (4)
            </button>
          </div>

          {/* Grid layout switcher */}
          <div
            className={`inline-flex items-center rounded-xl p-1 border text-xs ${
              isDark
                ? 'bg-slate-900/90 border-slate-800'
                : 'bg-slate-100/90 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setLayoutMode('grid-4')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                layoutMode === 'grid-4'
                  ? isDark
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-400'
              }`}
            >
              Grille 2×2
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('grid-8')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                layoutMode === 'grid-8'
                  ? isDark
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-400'
              }`}
            >
              Mosaïque (8)
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('focus')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                layoutMode === 'focus'
                  ? isDark
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-400'
              }`}
            >
              Grand Écran
            </button>
          </div>

          {/* Toggle FMI silhouettes */}
          <button
            type="button"
            onClick={() => setShowMotionOverlay((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              showMotionOverlay
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                : isDark
                ? 'bg-slate-900 border-slate-800 text-slate-400'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Comptage FMI {showMotionOverlay ? 'Actif' : 'Masqué'}</span>
          </button>
        </div>
      </div>

      {/* TOAST FEEDBACK ON SNAPSHOT CAPTURE */}
      {lastCaptureToast && (
        <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-3.5 py-2 text-xs font-bold text-emerald-400 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{lastCaptureToast}</span>
          </div>
          <span className="text-[10px] font-mono uppercase">Preuve NVR SHA-256</span>
        </div>
      )}

      {/* FOCUS / GRAND ÉCRAN MODE */}
      {layoutMode === 'focus' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Main Enlarged Camera Feed (8 cols) */}
          <div className="lg:col-span-8 rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 relative shadow-lg">
            <div className="aspect-video w-full relative">
              {renderCameraSceneSvg(
                focusedCamera,
                Boolean(irNightVisionMap[focusedCamera.id]),
                tickSec
              )}

              {/* Top HUD Overlay */}
              <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-xs border border-white/15 px-3 py-1.5 rounded-xl text-white">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  <span className="font-mono text-xs font-black text-rose-400">REC</span>
                  <span className="text-xs font-extrabold">
                    {focusedCamera.code} · {focusedCamera.name}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-500/30 text-violet-200">
                    {focusedCamera.clubShort}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-xs border border-white/15 px-3 py-1.5 rounded-xl text-white font-mono text-xs">
                  <span>{formattedDate}</span>
                  <span className="text-emerald-400 font-bold">{formattedTime}</span>
                </div>
              </div>

              {/* Bottom HUD Overlay */}
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-slate-950/85 backdrop-blur-xs border border-white/15 px-3.5 py-2 rounded-xl text-white">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="font-mono text-emerald-400 font-bold">
                    IP {focusedCamera.ipAddress}
                  </span>
                  <span className="text-slate-300">{focusedCamera.resolution}</span>
                  <span className="text-slate-300">
                    {focusedCamera.fps} fps · {focusedCamera.bitrateMbps} Mbps
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    <Users className="w-3.5 h-3.5" />
                    {focusedCamera.occupantsCount} / {focusedCamera.maxZoneCapacity} pers.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleToggleIr(focusedCamera.id, e)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {irNightVisionMap[focusedCamera.id] ? (
                      <>
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        <span>Mode Couleur</span>
                      </>
                    ) : (
                      <>
                        <Moon className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Vision IR</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleCaptureSnapshot(focusedCamera, e)}
                    className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Capturer Preuve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('grid-4')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Grille</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Selector for all 8 cameras + Heitz Event Correlation (4 cols) */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Sélectionner une caméra ({CLUB_CAMERAS.length} flux actifs)
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {CLUB_CAMERAS.map((cam) => {
                const isSelected = cam.id === focusedCamera.id;
                return (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => setSelectedCameraId(cam.id)}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-violet-600/15 border-violet-500 text-violet-400'
                        : isDark
                        ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700 text-slate-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-mono text-xs font-black">{cam.code}</span>
                        <span className="text-xs font-bold truncate">{cam.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {cam.clubLabel} · IP {cam.ipAddress}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 shrink-0">
                      {cam.occupantsCount} pers.
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* MULTI-CAMERA GRID VIEW (2×2 OR 4×2 MOSAIC) */
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            layoutMode === 'grid-8' ? 'xl:grid-cols-4' : 'xl:grid-cols-2'
          } gap-3.5`}
        >
          {filteredCameras.map((cam) => {
            const isIr = Boolean(irNightVisionMap[cam.id]);
            return (
              <div
                key={cam.id}
                onClick={() => {
                  setSelectedCameraId(cam.id);
                  setLayoutMode('focus');
                }}
                className={`group rounded-2xl overflow-hidden border transition-all cursor-pointer ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 hover:border-violet-500/60'
                    : 'bg-slate-950 border-slate-300 hover:border-violet-500 shadow-xs'
                }`}
              >
                {/* Video Canvas */}
                <div className="relative aspect-video w-full overflow-hidden">
                  {renderCameraSceneSvg(cam, isIr, tickSec)}

                  {/* Top Left Camera Badge */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-xs border border-white/15 px-2.5 py-1 rounded-lg text-white">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    <span className="font-mono text-[10px] font-black text-rose-400">
                      REC
                    </span>
                    <span className="font-mono text-[11px] font-extrabold">
                      {cam.code}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        cam.clubId === 'carre-de-soie'
                          ? 'bg-violet-500/30 text-violet-200'
                          : 'bg-sky-500/30 text-sky-200'
                      }`}
                    >
                      {cam.clubShort}
                    </span>
                  </div>

                  {/* Top Right Live Clock + IP */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-xs border border-white/15 px-2 py-1 rounded-lg text-[10px] font-mono text-slate-200">
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span>{cam.ipAddress}</span>
                    <span className="text-emerald-400 font-bold">{formattedTime}</span>
                  </div>

                  {/* Bottom Overlay Inside Video */}
                  <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 bg-slate-950/85 backdrop-blur-xs border border-white/10 px-2.5 py-1.5 rounded-lg text-white">
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{cam.name}</div>
                      <div className="text-[10px] text-slate-300 truncate">
                        {cam.heitzCorrelation}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                        {cam.occupantsCount}/{cam.maxZoneCapacity}
                      </span>
                      <button
                        type="button"
                        title="Activer/Désactiver Vision Infrarouge"
                        onClick={(e) => handleToggleIr(cam.id, e)}
                        className="p-1 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      >
                        {isIr ? (
                          <Sun className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Moon className="w-3.5 h-3.5 text-slate-300" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Capturer une image horodatée"
                        onClick={(e) => handleCaptureSnapshot(cam, e)}
                        className="p-1 rounded bg-violet-600/90 hover:bg-violet-500 text-white cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                      <span
                        title="Agrandir cette caméra"
                        className="p-1 rounded bg-slate-800/90 group-hover:bg-violet-600 text-white transition-colors"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FOOTER BAR : CORRÉLATION PORTILLONS HEITZ + CONFORMITÉ CNIL / PRÉFECTURE + CAPTURES */}
      <div
        className={`pt-3 border-t flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs ${
          isDark ? 'border-slate-800/90' : 'border-slate-200/80'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-500 font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            Conformité CNIL &amp; Préfecture : 0 caméra vestiaires/douches · Rétention NVR 30 j
          </span>

          {latestAccessEvent && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium ${
                isDark
                  ? 'bg-slate-900 text-slate-300 border border-slate-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-violet-500" />
              <span>
                Synchro Portillon Heitz :{' '}
                <strong>{latestAccessEvent.memberName}</strong> (
                {latestAccessEvent.clubId === 'carre-de-soie'
                  ? 'Portillon Center'
                  : 'Portillon Place'}
                )
              </span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshots.length > 0 && (
            <span className="text-[11px] font-semibold text-violet-400">
              Dernière capture : {snapshots[0].cameraCode} ({snapshots[0].timestamp})
            </span>
          )}
          {layoutMode === 'grid-4' && clubFilter === 'all' && (
            <button
              type="button"
              onClick={() => setLayoutMode('grid-8')}
              className="text-xs font-bold text-violet-500 hover:underline cursor-pointer"
            >
              Afficher les 8 caméras simultanément →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
