import { useLocalization } from "@/contexts/LocalizationContext";

export default function ChannelWelcome({ channelName }: { channelName: string }) {
  const { isRtl } = useLocalization();
  return (
    <div className="channel-welcome">
      <div className="channel-welcome-icon" aria-hidden>#</div>
      <h2 className="channel-welcome-title">{isRtl ? "مرحباً بك في" : "Welcome to"} #{channelName}!</h2>
      <p className="channel-welcome-desc">
        {isRtl ? <>هذه بداية قناة <strong>#{channelName}</strong>.</> : <>This is the start of the <strong>#{channelName}</strong> channel.</>}<br />
        {isRtl ? "ستظهر أحداث الكيانات من NATS هنا تلقائياً." : "Entity events from NATS will appear here automatically."}
      </p>
    </div>
  );
}
