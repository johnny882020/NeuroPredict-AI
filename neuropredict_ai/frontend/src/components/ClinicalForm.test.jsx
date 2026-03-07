import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import ClinicalForm from './ClinicalForm';

const defaultClinical = {
    age: 50,
    smoking: false,
    hypertension: false,
    previous_sah: false,
    familial_sah: false,
    population: 'other',
    earlier_sah_different_aneurysm: false,
    aneurysm_site: 'MCA',
    aneurysm_size_mm: 7.0,
    multiple_aneurysms: false,
    high_risk_location: false,
};

function Wrapper({ scanData, onSubmit, disabled }) {
    const [clinical, setClinical] = useState(defaultClinical);
    return (
        <ClinicalForm
            clinical={clinical}
            setClinical={setClinical}
            onSubmit={onSubmit || vi.fn()}
            scanData={scanData}
            disabled={disabled}
        />
    );
}

describe('ClinicalForm', () => {
    it('renders Patient History section header', () => {
        render(<Wrapper />);
        expect(screen.getByText(/Patient History/i)).toBeInTheDocument();
    });

    it('renders Aneurysm Profile section header', () => {
        render(<Wrapper />);
        expect(screen.getByText(/Aneurysm Profile/i)).toBeInTheDocument();
    });

    it('renders aneurysm size input with default value', () => {
        render(<Wrapper />);
        expect(screen.getByDisplayValue('7')).toBeInTheDocument();
    });

    it('renders population select with Finnish/Japanese option', () => {
        render(<Wrapper />);
        expect(screen.getByText(/Finnish or Japanese/i)).toBeInTheDocument();
    });

    it('renders aneurysm site select containing ICA, MCA and ACA options', () => {
        render(<Wrapper />);
        // Option elements are part of the DOM and queryable by their text content
        expect(screen.getByText(/ICA \(Internal Carotid Artery\)/i)).toBeInTheDocument();
        expect(screen.getByText(/MCA \(Middle Cerebral Artery\)/i)).toBeInTheDocument();
        expect(screen.getByText(/ACA.*Posterior/i)).toBeInTheDocument();
    });

    it('pre-fills aneurysm size from scanData morphology', () => {
        const scanData = { morphology: { maximum_3d_diameter_mm: 12.5 } };
        render(<Wrapper scanData={scanData} />);
        expect(screen.getByDisplayValue('12.5')).toBeInTheDocument();
    });

    it('calls onSubmit when Calculate Risk Scores button is clicked', () => {
        const onSubmit = vi.fn();
        render(<Wrapper onSubmit={onSubmit} />);
        fireEvent.click(screen.getByRole('button', { name: /Calculate Risk Scores/i }));
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('shows disabled label when disabled prop is true', () => {
        render(<Wrapper disabled={true} />);
        expect(screen.getByRole('button', { name: /Upload a scan to enable/i })).toBeInTheDocument();
    });

    it('does not call onSubmit when button is disabled', () => {
        const onSubmit = vi.fn();
        render(<Wrapper onSubmit={onSubmit} disabled={true} />);
        fireEvent.click(screen.getByRole('button', { name: /Upload a scan to enable/i }));
        expect(onSubmit).not.toHaveBeenCalled();
    });
});
