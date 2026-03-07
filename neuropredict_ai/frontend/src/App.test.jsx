import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

describe('App', () => {
    it('renders the dashboard title', () => {
        render(<App />);
        // Title is "NeuroPredict" + <span>AI</span> in header, and also in footer.
        // Use getAllByText and confirm at least one element is present.
        const matches = screen.getAllByText(/NeuroPredict/i);
        expect(matches.length).toBeGreaterThan(0);
    });

    it('renders the file upload input', () => {
        render(<App />);
        // Button text includes icon prefix — use partial regex match
        expect(screen.getByText(/Analyze CTA Scan/i)).toBeInTheDocument();
    });

    it('renders the upload button as disabled without a file', () => {
        render(<App />);
        const button = screen.getByText(/Analyze CTA Scan/i);
        expect(button).toBeDisabled();
    });
});
