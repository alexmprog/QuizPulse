import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from './Field';

describe('Field', () => {
    it('links the label to the input', () => {
        render(<Field label="Email" hint="We never share it" />);
        const input = screen.getByLabelText('Email');
        expect(input.tagName).toBe('INPUT');
        expect(input).toHaveAccessibleDescription('We never share it');
        expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('shows the error with role="alert" and marks the input invalid', () => {
        render(<Field label="Email" hint="hint" error="Wrong email" />);
        expect(screen.getByRole('alert')).toHaveTextContent('Wrong email');
        const input = screen.getByLabelText('Email');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveClass('invalid');
        expect(input).toHaveAccessibleDescription('Wrong email');
    });
});
