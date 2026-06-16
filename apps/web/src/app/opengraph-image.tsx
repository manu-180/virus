import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'VIRUS — Dev content, weaponized.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#04070A',
          display: 'flex',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glows */}
        <div
          style={{
            position: 'absolute',
            left: '-60px',
            top: '-60px',
            width: '480px',
            height: '480px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(74,222,128,0.14) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '160px',
            bottom: '-80px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(74,222,128,0.07) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Left: text content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '72px 0 72px 80px',
            flex: 1,
          }}
        >
          {/* Brand row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '56px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle at 33% 27%, #ECFDF5 0%, #86EFAC 18%, #4ADE80 46%, #16A34A 76%, #14532D 100%)',
                boxShadow: '0 0 20px rgba(74,222,128,0.6), 0 0 50px rgba(74,222,128,0.2)',
                display: 'flex',
                flexShrink: 0,
              }}
            />
            <div
              style={{
                color: '#4ADE80',
                fontSize: '24px',
                fontWeight: 700,
                letterSpacing: '0.24em',
                display: 'flex',
              }}
            >
              VIRUS
            </div>
          </div>

          {/* Headline */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                color: '#F0FDF4',
                fontSize: '80px',
                fontWeight: 800,
                lineHeight: 0.95,
                letterSpacing: '-0.03em',
                display: 'flex',
              }}
            >
              Dev content,
            </div>
            <div
              style={{
                color: '#4ADE80',
                fontSize: '80px',
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                display: 'flex',
              }}
            >
              weaponized.
            </div>
          </div>

          {/* Subtitle */}
          <div
            style={{
              marginTop: '28px',
              color: '#6B7280',
              fontSize: '20px',
              lineHeight: 1.6,
              maxWidth: '560px',
              display: 'flex',
            }}
          >
            Generate, render, and schedule dev videos for Reels, TikTok & YouTube Shorts —
            automated with your voice.
          </div>

          {/* Feature tags */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '40px' }}>
            <div
              style={{
                padding: '8px 20px',
                border: '1px solid rgba(74,222,128,0.25)',
                borderRadius: '6px',
                color: '#4ADE80',
                fontSize: '15px',
                background: 'rgba(74,222,128,0.06)',
                display: 'flex',
              }}
            >
              AI Scripts
            </div>
            <div
              style={{
                padding: '8px 20px',
                border: '1px solid rgba(74,222,128,0.25)',
                borderRadius: '6px',
                color: '#4ADE80',
                fontSize: '15px',
                background: 'rgba(74,222,128,0.06)',
                display: 'flex',
              }}
            >
              Voice Clone
            </div>
            <div
              style={{
                padding: '8px 20px',
                border: '1px solid rgba(74,222,128,0.25)',
                borderRadius: '6px',
                color: '#4ADE80',
                fontSize: '15px',
                background: 'rgba(74,222,128,0.06)',
                display: 'flex',
              }}
            >
              Auto Render
            </div>
            <div
              style={{
                padding: '8px 20px',
                border: '1px solid rgba(74,222,128,0.25)',
                borderRadius: '6px',
                color: '#4ADE80',
                fontSize: '15px',
                background: 'rgba(74,222,128,0.06)',
                display: 'flex',
              }}
            >
              Viral Ready
            </div>
          </div>
        </div>

        {/* Right: large sphere */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '340px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '240px',
              height: '240px',
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 33% 27%, #ECFDF5 0%, #BBF7D0 14%, #4ADE80 40%, #22C55E 68%, #14532D 100%)',
              boxShadow:
                '0 0 60px rgba(74,222,128,0.45), 0 0 120px rgba(74,222,128,0.18), 0 0 200px rgba(74,222,128,0.07)',
              display: 'flex',
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  )
}
