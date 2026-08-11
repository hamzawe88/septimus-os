import { useLocalization } from "@/contexts/LocalizationContext";

export default function ChannelWelcome({ channelName }: { channelName: string }) {
  const { t } = useLocalization();
  return (
    <div className="channel-welcome">
      <div className="channel-welcome-icon" aria-hidden>#</div>
      <h2 className="channel-welcome-title">{t("chat.channelWelcome.title")} #{channelName}!</h2>
      <p className="channel-welcome-desc">
        {t("chat.channelWelcome.startBefore")} <strong>#{channelName}</strong> {t("chat.channelWelcome.startAfter")}
        <br />
        {t("chat.channelWelcome.events")}
      </p>
    </div>
  );
}
