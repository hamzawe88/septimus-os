export default function ChannelWelcome({ channelName }: { channelName: string }) {
  return (
    <div className="channel-welcome">
      <div className="channel-welcome-icon" aria-hidden>#</div>
      <h2 className="channel-welcome-title">Welcome to #{channelName}!</h2>
      <p className="channel-welcome-desc">
        This is the start of the <strong>#{channelName}</strong> channel.<br />
        Entity events from NATS will appear here automatically.
      </p>
    </div>
  );
}
