/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { AgencyClient } from "@/lib/agency/types";
import {
  DEFAULT_PROJECT_DETAILS,
  PROJECT_CURRENCIES,
  PROJECT_DATE_FORMATS,
  PROJECT_LANGUAGES,
  PROJECT_TIMEZONES,
} from "@/lib/projects/config";

export function ProjectDetailsFields({
  project,
  teams = [],
  includeTeam = false,
}: {
  project?: AgencyClient;
  teams?: { id: string; name: string }[];
  includeTeam?: boolean;
}) {
  const defaults = project ?? DEFAULT_PROJECT_DETAILS;
  const [logoPreview, setLogoPreview] = useState(project?.logo_url ?? "");

  return (
    <div className="pj-project-fields">
      <fieldset>
        <legend>Identificação do cliente</legend>
        <div className="pj-form-row">
          <label>
            Nome do projeto
            <input
              name="name"
              defaultValue={defaults.name}
              autoComplete="organization"
              required
              minLength={2}
              maxLength={120}
              placeholder="Ex.: Los Burguer"
            />
          </label>
          <label>
            Segmento
            <input
              name="segment"
              defaultValue={defaults.segment}
              required
              minLength={2}
              maxLength={80}
              placeholder="Ex.: Restaurante / Delivery"
            />
          </label>
        </div>
        <div className="pj-form-row">
          <label>
            Unidade
            <input
              name="unit"
              defaultValue={defaults.unit}
              required
              minLength={2}
              maxLength={100}
              placeholder="Ex.: Unidade Centro"
            />
          </label>
          <label>
            E-mail de contato
            <input
              name="contact_email"
              type="email"
              autoComplete="email"
              defaultValue={defaults.contact_email ?? ""}
              maxLength={320}
              placeholder="cliente@empresa.com"
            />
          </label>
        </div>
        {includeTeam ? (
          <label>
            Equipe responsável
            <select name="team_id" required defaultValue={teams[0]?.id ?? ""}>
              {!teams.length ? <option value="">Nenhuma equipe disponível</option> : null}
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </fieldset>

      <fieldset>
        <legend>Logo e apresentação</legend>
        <div className="pj-logo-field">
          <label>
            URL HTTPS da logo
            <input
              name="logo_url"
              type="url"
              inputMode="url"
              defaultValue={defaults.logo_url ?? ""}
              maxLength={2048}
              placeholder="https://empresa.com/logo.png"
              onChange={(event) =>
                setLogoPreview(
                  event.currentTarget.value.startsWith("https://")
                    ? event.currentTarget.value
                    : "",
                )
              }
            />
            <small>A imagem será usada no projeto e na capa dos relatórios.</small>
          </label>
          <div className="pj-logo-preview" aria-label="Prévia da logo">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Prévia da logo do projeto"
                onError={() => setLogoPreview("")}
              />
            ) : (
              <span aria-hidden="true">
                {(defaults.name || "L").slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Idioma, números e datas</legend>
        <div className="pj-form-row pj-form-row-3">
          <label>
            Idioma
            <select name="language" defaultValue={defaults.language} required>
              {PROJECT_LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Moeda
            <select name="currency" defaultValue={defaults.currency} required>
              {PROJECT_CURRENCIES.map((currency) => (
                <option key={currency.value} value={currency.value}>
                  {currency.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Formato de data
            <select name="date_format" defaultValue={defaults.date_format} required>
              {PROJECT_DATE_FORMATS.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="pj-form-row pj-form-row-3">
          <label>
            Separador decimal
            <select
              name="decimal_separator"
              defaultValue={defaults.decimal_separator}
              required
            >
              <option value=",">Vírgula — 1,50</option>
              <option value=".">Ponto — 1.50</option>
            </select>
          </label>
          <label>
            Separador de milhar
            <select
              name="thousands_separator"
              defaultValue={defaults.thousands_separator}
              required
            >
              <option value=".">Ponto — 1.000</option>
              <option value=",">Vírgula — 1,000</option>
            </select>
          </label>
          <label>
            Fuso horário
            <select name="timezone" defaultValue={defaults.timezone} required>
              {PROJECT_TIMEZONES.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
    </div>
  );
}

