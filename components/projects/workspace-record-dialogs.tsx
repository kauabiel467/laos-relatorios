import { Dialog, FieldMessage } from "./ui";

export function GoalUpdateDialog({
  busy,
  defaultActual,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  defaultActual: number;
  onClose: () => void;
  onSubmit: (actual: number) => void;
}) {
  return (
    <Dialog title="Atualizar meta" close={onClose} busy={busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(Number(new FormData(e.currentTarget).get("actual")));
        }}
      >
        <label>
          Valor realizado
          <input data-autofocus name="actual" type="number" min="0" step="any" required defaultValue={defaultActual} />
          <FieldMessage>Informe o resultado acumulado até agora.</FieldMessage>
        </label>
        <div className="pj-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button disabled={busy} className="primary">
            {busy ? "Salvando…" : "Salvar resultado"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function RecordCreateDialog({
  kind,
  busy,
  onClose,
  onSubmit,
}: {
  kind: "goal" | "timeline";
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <Dialog title={kind === "goal" ? "Nova meta" : "Registrar ação"} close={onClose} busy={busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        <label>
          Título
          <input data-autofocus name="title" required maxLength={180} aria-describedby="record-title-help" />
          <FieldMessage id="record-title-help">Use um título curto e fácil de reconhecer no histórico.</FieldMessage>
        </label>
        {kind === "goal" && (
          <>
            <label>
              Indicador
              <input name="metric" required placeholder="Ex.: Compras no site" />
            </label>
            <div className="pj-form-row">
              <label>
                Meta
                <input name="target" type="number" min="0.01" step="any" required />
              </label>
              <label>
                Realizado
                <input name="actual" type="number" min="0" step="any" defaultValue="0" required />
              </label>
            </div>
            <label>
              Prazo
              <input name="deadline" type="date" required />
            </label>
          </>
        )}
        <label>
          Descrição
          <textarea name="description" rows={4} />
        </label>
        <label>
          Visibilidade
          <select name="visibility">
            <option value="internal">Interno da equipe</option>
            <option value="shared">Compartilhado com o cliente</option>
          </select>
        </label>
        <button className="accent" disabled={busy}>
          {busy ? "Salvando…" : kind === "goal" ? "Criar meta" : "Registrar ação"}
        </button>
      </form>
    </Dialog>
  );
}
