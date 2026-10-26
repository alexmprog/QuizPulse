import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnswerSlot, FALSE_SLOT, SLOT_SHAPES, TRUE_SLOT } from './AnswerSlot';

describe('AnswerSlot', () => {
    it('index 2 renders circle shape and label', () => {
        const { container } = render(<AnswerSlot index={2} label="Venus" size="play" />);
        expect(container.querySelector('.shape.cir')).not.toBeNull();
        expect(screen.getByText('Venus')).toBeVisible();
        expect(container.firstElementChild).toHaveClass('opt-c');
    });

    it('maps every index to its shape', () => {
        expect(SLOT_SHAPES).toEqual(['tri', 'dia', 'cir', 'sq']);
        expect(TRUE_SLOT).toBe(1);
        expect(FALSE_SLOT).toBe(0);
    });

    it('renders a real button that fires onClick unless disabled', async () => {
        const onClick = vi.fn();
        const { rerender } = render(<AnswerSlot index={0} label="A" size="play" as="button" onClick={onClick} />);
        await userEvent.click(screen.getByRole('button', { name: 'A' }));
        expect(onClick).toHaveBeenCalledTimes(1);
        rerender(<AnswerSlot index={0} label="A" size="play" as="button" onClick={onClick} disabled />);
        expect(screen.getByRole('button', { name: 'A' })).toBeDisabled();
    });
});
