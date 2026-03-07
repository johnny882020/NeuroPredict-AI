import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

describe('App', () => {
    it('renders the dashboard title', () => {
        render(<App />);
        const matches = screen.getAllByText(/NeuroPredict/i);
        expect(matches.length).toBeGreaterThan(0);
    });

    it('renders the file upload input', () => {
        render(<App />);
        expect(screen.getByText(/Analyze CTA Scan/i)).toBeInTheDocument();
    });

    it('renders the upload button as disabled without a file', () => {
        render(<App />);
        const button = screen.getByText(/Analyze CTA Scan/i);
        expect(button).toBeDisabled();
    });

    it('renders all 5 navigation tabs', () => {
        render(<App />);
        expect(screen.getByText('DICOM View')).toBeInTheDocument();
        expect(screen.getByText('CTA Analysis')).toBeInTheDocument();
        expect(screen.getByText('Risk & Clinical')).toBeInTheDocument();
        expect(screen.getByText('MARTA Assessment')).toBeInTheDocument();
        expect(screen.getByText('Treatment Sim')).toBeInTheDocument();
    });

    it('shows ClinicalForm when Risk & Clinical tab is clicked', () => {
        render(<App />);
        fireEvent.click(screen.getByText('Risk & Clinical'));
        expect(screen.getByText(/Patient History/i)).toBeInTheDocument();
        // Use getByRole to target only the button, not the hint text
        expect(screen.getByRole('button', { name: /Calculate Risk Scores/i })).toBeInTheDocument();
    });

    it('shows MARTA form when MARTA Assessment tab is clicked', () => {
        render(<App />);
        fireEvent.click(screen.getByText('MARTA Assessment'));
        expect(screen.getByText(/Calculate MARTA Score/i)).toBeInTheDocument();
    });

    it('shows treatment gating message when Treatment Sim tab is clicked without a scan', () => {
        render(<App />);
        fireEvent.click(screen.getByText('Treatment Sim'));
        // Without a scan, the tab shows a gating message instead of treatment buttons
        expect(screen.getByText(/Analyze a CTA scan first/i)).toBeInTheDocument();
    });

    it('shows DICOM placeholder text when DICOM View tab is clicked without a file', () => {
        render(<App />);
        fireEvent.click(screen.getByText('DICOM View'));
        // Without a file, the DICOM tab shows a no-file message and the upload input
        expect(screen.getByText(/No file loaded/i)).toBeInTheDocument();
    });
});
