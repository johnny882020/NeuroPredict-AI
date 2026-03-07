import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClinicalDecision from './ClinicalDecision';

const mockSynthesis = {
    recommendation: 'Treatment — Endovascular (EVT)',
    strength: 'Strong',
    rationale: ['PHASES 5-yr risk: 4.3% (High)', 'UIATS net: +4 — Treatment recommended'],
    evidence_level: 'B',
    disclaimer: 'For clinical decision support only. Physician judgment supersedes all recommendations.',
};

describe('ClinicalDecision', () => {
    it('renders recommendation text', () => {
        render(<ClinicalDecision synthesis={mockSynthesis} decision={null} onDecision={vi.fn()} />);
        expect(screen.getByText(/Treatment — Endovascular/i)).toBeInTheDocument();
    });

    it('renders strength badge', () => {
        render(<ClinicalDecision synthesis={mockSynthesis} decision={null} onDecision={vi.fn()} />);
        expect(screen.getByText(/Strong/i)).toBeInTheDocument();
    });

    it('renders rationale bullets', () => {
        render(<ClinicalDecision synthesis={mockSynthesis} decision={null} onDecision={vi.fn()} />);
        expect(screen.getByText(/PHASES 5-yr risk/i)).toBeInTheDocument();
        expect(screen.getByText(/UIATS net/i)).toBeInTheDocument();
    });

    it('renders disclaimer text', () => {
        render(<ClinicalDecision synthesis={mockSynthesis} decision={null} onDecision={vi.fn()} />);
        expect(screen.getByText(/clinical decision support only/i)).toBeInTheDocument();
    });

    it('calls onDecision with accept when Accept button clicked', () => {
        const onDecision = vi.fn();
        render(<ClinicalDecision synthesis={mockSynthesis} decision={null} onDecision={onDecision} />);
        fireEvent.click(screen.getByText(/Accept/i));
        expect(onDecision).toHaveBeenCalledWith('accept', null);
    });

    it('reveals textarea when Override button clicked', () => {
        render(<ClinicalDecision synthesis={mockSynthesis} decision={null} onDecision={vi.fn()} />);
        fireEvent.click(screen.getByText(/Override/i));
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('shows error when Confirm Override clicked with empty reason', () => {
        render(<ClinicalDecision synthesis={mockSynthesis} decision={null} onDecision={vi.fn()} />);
        fireEvent.click(screen.getByText(/Override/i));
        // Click confirm without entering a reason
        fireEvent.click(screen.getByText(/Confirm Override/i));
        // Should show validation error message
        expect(screen.getByText(/reason is required/i)).toBeInTheDocument();
    });

    it('calls onDecision with override and reason when reason is entered', () => {
        const onDecision = vi.fn();
        render(<ClinicalDecision synthesis={mockSynthesis} decision={null} onDecision={onDecision} />);
        fireEvent.click(screen.getByText(/Override/i));
        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'Patient declined EVT procedure' } });
        fireEvent.click(screen.getByText(/Confirm Override/i));
        expect(onDecision).toHaveBeenCalledWith('override', 'Patient declined EVT procedure');
    });

    it('renders nothing when synthesis is null', () => {
        const { container } = render(
            <ClinicalDecision synthesis={null} decision={null} onDecision={vi.fn()} />
        );
        // Component returns null — container div is empty
        expect(container.firstChild).toBeNull();
    });
});
