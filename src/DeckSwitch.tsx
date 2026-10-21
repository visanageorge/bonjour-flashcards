type Props = {
  name: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

export default function DeckSwitch({ name, enabled, disabled, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`deck-switch ${enabled ? "is-on" : "is-off"}`}
      role="switch"
      aria-checked={enabled}
      aria-label={`Studiu zilnic pentru ${name}`}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="switch-track" aria-hidden="true"><span /></span>
      {enabled ? "ON" : "OFF"}
    </button>
  );
}
