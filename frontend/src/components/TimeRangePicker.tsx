import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';

export interface TimeRangeOption {
  label: string;
  hours: number;
}

const PRESETS: TimeRangeOption[] = [
  { label: 'Last 1 hour',   hours: 1   },
  { label: 'Last 6 hours',  hours: 6   },
  { label: 'Last 24 hours', hours: 24  },
  { label: 'Last 7 days',   hours: 168 },
  { label: 'Last 30 days',  hours: 720 },
];

interface Props {
  value:    number;
  onChange: (hours: number) => void;
  size?:    'small' | 'medium';
  minWidth?: number;
}

export default function TimeRangePicker({ value, onChange, size = 'small', minWidth = 160 }: Props) {
  const handleChange = (e: SelectChangeEvent<number>) => {
    onChange(Number(e.target.value));
  };

  return (
    <FormControl size={size} sx={{ minWidth }}>
      <InputLabel>Time Range</InputLabel>
      <Select<number>
        value={value}
        label="Time Range"
        onChange={handleChange}
      >
        {PRESETS.map((p) => (
          <MenuItem key={p.hours} value={p.hours}>
            {p.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
