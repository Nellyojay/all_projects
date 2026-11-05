import './BudgetGeneralFields.css';

export function BudgetGeneralFields({
  name,
  description,
  onNameChange,
  onDescriptionChange,
}: {
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <>
      <label className="budget-general-field">
        Budget name
        <input
          required
          value={name}
          maxLength={80}
          onChange={(event) => onNameChange(event.currentTarget.value)}
          placeholder="Give your budget a name"
          className="budget-general-input"
        />
      </label>
      <label className="budget-general-field">
        Description · optional
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.currentTarget.value)}
          placeholder="Add a note about this budget"
          rows={2}
          className="budget-general-input budget-general-textarea"
        />
      </label>
    </>
  );
}
