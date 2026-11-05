import type { CSSProperties } from 'react';

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
      <label style={fieldStyle}>
        Budget name
        <input
          required
          value={name}
          maxLength={80}
          onChange={(event) => onNameChange(event.currentTarget.value)}
          placeholder="Give your budget a name"
          style={inputStyle}
        />
      </label>
      <label style={fieldStyle}>
        Description · optional
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.currentTarget.value)}
          placeholder="Add a note about this budget"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
    </>
  );
}

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: '#A0A0A0',
  fontSize: 13,
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 42,
  padding: '10px 12px',
  background: '#111',
  border: '1px solid #303030',
  borderRadius: 8,
  color: '#FFF',
  font: 'inherit',
};
