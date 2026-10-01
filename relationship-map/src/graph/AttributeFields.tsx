import { promptText } from '../transport';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Value = string | number | boolean | null;

function AttributeRow({ name, value, onValue, onRename, onRemove }: {
  name: string;
  value: Value;
  onValue: (value: string) => void;
  onRename: (name: string) => boolean;
  onRemove: () => void;
}) {
  const [draftName, setDraftName] = useState(name);
  return <div className="attribute-row">
    <Input aria-label="Название поля" value={draftName} onChange={event => setDraftName(event.target.value)} onBlur={() => {
      const next = draftName.trim();
      if (!next) { setDraftName(name); return; }
      if (next !== name && !onRename(next)) setDraftName(name);
    }} />
    <Textarea aria-label={`Значение поля ${name}`} value={value === null ? 'null' : String(value)} onChange={event => onValue(event.target.value)} />
    <Button variant="ghost" size="sm" onClick={onRemove}>Убрать поле</Button>
  </div>;
}

export function AttributeFields({ attributes, onChange }: {
  attributes: Record<string, Value> | undefined;
  onChange: (attributes: Record<string, Value>) => void;
}) {
  const fields = attributes || {};
  return <div className="source-list">
    <strong>Дополнительные поля</strong>
    {Object.entries(fields).map(([name, value]) => <AttributeRow key={name} name={name} value={value}
      onValue={next => onChange({ ...fields, [name]: next })}
      onRename={next => {
        if (next in fields) return false;
        const renamed = Object.fromEntries(Object.entries(fields).map(([key, current]) => [key === name ? next : key, current]));
        onChange(renamed);
        return true;
      }}
      onRemove={() => { const next = { ...fields }; delete next[name]; onChange(next); }} />)}
    <Button variant="outline" onClick={async () => {
      const name = (await promptText('Название поля, например «Сигнатура»:'))?.trim();
      if (name && !(name in fields)) onChange({ ...fields, [name]: '' });
    }}>Добавить поле</Button>
  </div>;
}
