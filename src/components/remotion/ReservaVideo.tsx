import React from 'react';
import {
    AbsoluteFill,
    Sequence,
    spring,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    Easing,
} from 'remotion';

export const RESERVA_VIDEO_CONFIG = {
    width: 1280,
    height: 720,
    fps: 30,
    durationInFrames: 610,
};

// --- SCENE 1: The Sleek Push Notification & Zoom ---
const SceneOneZoom = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Bounces in like an iOS notification
    const introScale = spring({ fps, frame, config: { damping: 14, stiffness: 200, mass: 1 } });

    // Aggressive zoom into the notification happens later now (gives user time to read)
    const extremeZoom = interpolate(frame, [105, 120], [1, 150], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.in(Easing.exp),
    });

    return (
        <AbsoluteFill style={{ backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' }}>
            {/* The "Glassmorphic" Notification Card */}
            <div
                style={{
                    transform: `scale(${introScale * extremeZoom})`,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)', // Sleek dark mode glass
                    backdropFilter: 'blur(20px)', // Glassmorphism effect
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '25px',
                    borderRadius: '35px',
                    display: 'flex',
                    flexDirection: 'column',
                    width: '800px',
                    boxShadow: '0px 30px 60px rgba(0,0,0,0.5)',
                }}
            >
                {/* App Header (Icon + Name + Time) */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ width: '50px', height: '50px', backgroundColor: '#25D366', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <span style={{ color: '#fff', fontSize: '30px' }}>💬</span>
                    </div>
                    <span style={{ color: '#aaa', fontSize: '30px', fontWeight: 600, marginLeft: '20px', flex: 1 }}>WhatsApp</span>
                    <span style={{ color: '#666', fontSize: '25px' }}>Ahora</span>
                </div>

                {/* Message Content */}
                <span style={{ color: '#fff', fontSize: '40px', fontWeight: 700, fontFamily: 'sans-serif' }}>
                    Cliente Nuevo
                </span>
                <span style={{ color: '#ddd', fontSize: '35px', fontWeight: 400, fontFamily: 'sans-serif', marginTop: '10px' }}>
                    ¿Tienes hueco para un degradado hoy?
                </span>
            </div>
        </AbsoluteFill>
    );
};

// --- SCENE 2: The Reality Check (Kinetic Typography) ---
const SceneTwoSlam = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const slamScale1 = spring({ fps, frame, config: { damping: 14, stiffness: 250, mass: 2 } });
    const slamScale2 = spring({ fps, frame: frame - 10, config: { damping: 14, stiffness: 250, mass: 2 } });
    const exitOpacity = interpolate(frame, [75, 85], [1, 0]);

    return (
        <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', opacity: exitOpacity }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'sans-serif' }}>
                <h1 style={{ color: '#FFF', fontSize: '100px', fontWeight: 900, margin: 0, transform: `scale(${slamScale1})`, textTransform: 'uppercase' }}>
                    No contestas.
                </h1>
                <h1 style={{ color: '#FF3B30', fontSize: '120px', fontWeight: 900, margin: 0, transform: `scale(${slamScale2})`, textTransform: 'uppercase', textShadow: '0px 10px 30px rgba(255, 59, 48, 0.4)' }}>
                    Pierdes dinero.
                </h1>
            </div>
        </AbsoluteFill>
    );
};

// --- SCENE 3: The Hero Reveal (3D Space) ---
const SceneThreeHero = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const scaleUp = spring({ fps, frame, config: { damping: 20, stiffness: 100 } });
    const rotateY = interpolate(frame, [0, 90], [-20, 20]);
    const subtextOpacity = interpolate(frame, [20, 40], [0, 1]);

    return (
        <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', perspective: '1000px' }}>
            <div style={{ transform: `scale(${scaleUp}) rotateY(${rotateY}deg)`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h1 style={{ color: '#10B981', fontSize: '160px', fontWeight: 900, margin: 0, fontFamily: 'sans-serif', letterSpacing: '-5px' }}>
                    AGENDALO
                </h1>
                <p style={{ color: '#FFF', fontSize: '40px', fontWeight: 400, margin: 0, opacity: subtextOpacity, fontFamily: 'sans-serif' }}>
                    Tu negocio, siempre disponible.
                </p>
            </div>
        </AbsoluteFill>
    );
};

// --- SCENE 4: Real App UI (Chat Bubbles & Calendar Grid) ---
const SceneFourInteraction = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Client Message slides in from the left
    const clientMsgIn = spring({ fps, frame, config: { damping: 15 } });
    const clientMsgOut = interpolate(frame, [45, 55], [0, -1500], { easing: Easing.in(Easing.exp) });

    // Calendar App scales in from the center
    const calendarScale = spring({ fps, frame: frame - 40, config: { damping: 14, stiffness: 180 } });

    // Bot Message fires in from the right
    const botMsgScale = spring({ fps, frame: frame - 80, config: { damping: 12, stiffness: 150 } });

    return (
        <AbsoluteFill style={{ backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>

            {/* 💬 CLIENT CHAT BUBBLE (Left Aligned) */}
            {frame < 60 && (
                <div style={{
                    transform: `scale(${clientMsgIn}) translateX(${clientMsgOut}px)`,
                    position: 'absolute', left: '100px', top: '300px', display: 'flex', alignItems: 'flex-end'
                }}>
                    {/* Fake Avatar */}
                    <div style={{ width: '80px', height: '80px', borderRadius: '40px', backgroundColor: '#444', marginRight: '20px', backgroundImage: 'radial-gradient(circle, #666, #333)' }} />
                    {/* Message Bubble */}
                    <div style={{ backgroundColor: '#333', padding: '30px 40px', borderRadius: '30px 30px 30px 5px', color: '#fff', fontSize: '40px' }}>
                        ¿A las 18:00?
                    </div>
                </div>
            )}

            {/* 📅 BOOKSY CALENDAR UI (The "Engine") */}
            {frame >= 40 && frame < 90 && (
                <div style={{ transform: `scale(${calendarScale})`, position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#111', padding: '40px', borderRadius: '40px', border: '2px solid #333' }}>
                    <span style={{ color: '#00C3FF', fontWeight: 900, fontSize: '30px', marginBottom: '20px' }}>Booksy Calendar</span>
                    {/* A mini UI Grid representing time slots */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <div style={{ padding: '20px 40px', backgroundColor: '#222', borderRadius: '15px', color: '#666', fontSize: '25px' }}>17:00</div>
                        <div style={{ padding: '20px 40px', backgroundColor: '#222', borderRadius: '15px', color: '#666', fontSize: '25px' }}>17:30</div>
                        {/* This is the slot being booked! It lights up green! */}
                        <div style={{
                            padding: '20px 40px',
                            backgroundColor: frame > 60 ? '#25D366' : '#222',
                            borderRadius: '15px',
                            color: frame > 60 ? '#000' : '#666',
                            fontSize: '25px',
                            fontWeight: frame > 60 ? 900 : 400,
                            transition: 'all 0.2s'
                        }}>
                            18:00
                        </div>
                        <div style={{ padding: '20px 40px', backgroundColor: '#222', borderRadius: '15px', color: '#666', fontSize: '25px' }}>18:30</div>
                    </div>
                </div>
            )}

            {/* 🤖 BOT RESPONSE BUBBLE (Right Aligned) */}
            {frame >= 80 && (
                <div style={{
                    transform: `scale(${botMsgScale})`,
                    position: 'absolute', right: '100px', bottom: '300px', display: 'flex', alignItems: 'flex-end', flexDirection: 'row-reverse'
                }}>
                    {/* Bot Avatar */}
                    <div style={{ width: '80px', height: '80px', borderRadius: '40px', backgroundColor: '#25D366', marginLeft: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <span style={{ fontSize: '40px' }}>🤖</span>
                    </div>
                    {/* Bot Message Bubble */}
                    <div style={{ backgroundColor: '#25D366', padding: '30px 40px', borderRadius: '30px 30px 5px 30px', color: '#000', fontSize: '40px', fontWeight: 800 }}>
                        ✅ Reservado. ¡Nos vemos!
                    </div>
                </div>
            )}
        </AbsoluteFill>
    );
};

// --- SCENE 5: Strobe Text Flex ---
const SceneFiveFlex = () => {
    const frame = useCurrentFrame();

    let text = "";
    let fontSize = "120px";
    let color = "#FFF";

    if (frame < 20) {
        text = "24/7";
    } else if (frame < 40) {
        text = "100% AUTOMÁTICO";
        fontSize = "90px";
    } else {
        text = "TÚ SOLO TRABAJAS.";
        fontSize = "100px";
        color = "#10B981";
    }

    return (
        <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
            <h1 style={{ color, fontSize, fontWeight: 900, textAlign: 'center', margin: 0, textTransform: 'uppercase' }}>
                {text}
            </h1>
        </AbsoluteFill>
    );
};

// --- SCENE 6: The Heavy Drop & CTA ---
const SceneSixCTA = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const dropY = spring({ fps, frame, config: { mass: 4, damping: 10, stiffness: 100 } });
    const ctaY = interpolate(dropY, [0, 1], [-1000, 0]);

    const textOpacity = interpolate(frame, [30, 50], [0, 1]);

    return (
        <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
            <div style={{ transform: `translateY(${ctaY}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h1 style={{ color: '#FFF', fontSize: '110px', fontWeight: 900, margin: 0, lineHeight: '1.2' }}>
                    Recupera tu <span style={{ color: '#10B981' }}>tiempo.</span>
                </h1>
            </div>

            <div style={{ opacity: textOpacity, position: 'absolute', bottom: '100px', textAlign: 'center' }}>
                <p style={{ color: '#FFF', fontSize: '40px', fontWeight: 600, margin: '0 0 10px 0' }}>
                    Empieza hoy mismo.
                </p>
                <p style={{ color: '#10B981', fontSize: '30px', fontWeight: 400, margin: 0 }}>
                    agendalo.pro
                </p>
            </div>
        </AbsoluteFill>
    );
};

// --- MAIN COMPOSITION ---
export const ReservaVideo: React.FC = () => {
    // We added +60 frames to SceneOneZoom, so every subsequent Sequence needs its offset ('from') shifted by +60.
    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            <Sequence from={0} durationInFrames={120}>
                <SceneOneZoom />
            </Sequence>
            <Sequence from={118} durationInFrames={82}>
                <SceneTwoSlam />
            </Sequence>
            <Sequence from={200} durationInFrames={90}>
                <SceneThreeHero />
            </Sequence>
            <Sequence from={290} durationInFrames={120}>
                <SceneFourInteraction />
            </Sequence>
            <Sequence from={410} durationInFrames={80}>
                <SceneFiveFlex />
            </Sequence>
            <Sequence from={490} durationInFrames={120}>
                <SceneSixCTA />
            </Sequence>
        </AbsoluteFill>
    );
};

export default ReservaVideo;
