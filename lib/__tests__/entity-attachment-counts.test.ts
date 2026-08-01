import { countEntityAttachmentsById } from "../entity-attachment-counts";

describe("countEntityAttachmentsById", () => {
  it("cuenta todos los archivos de cada entidad desde un listado plano", () => {
    expect(countEntityAttachmentsById("1/movement", [
      { key: "1/movement/843/ticket.jpg" },
      { key: "1/movement/843/voucher.pdf" },
      { key: "1/movement/812/photo.png" },
    ])).toEqual({ 812: 1, 843: 2 });
  });

  it("acepta keys que incluyan el bucket y omite drafts u otras rutas", () => {
    expect(countEntityAttachmentsById("1/movement", [
      { key: "receipts/1/movement/843/ticket.jpg" },
      { key: "1/movement/draft/form-1/pending.jpg" },
      { key: "2/movement/843/other-workspace.jpg" },
      { key: "1/obligation-event/843/event.jpg" },
      { key: "1/movement/invalid/file.jpg" },
    ])).toEqual({ 843: 1 });
  });

  it("usa name como respaldo solo cuando contiene la ruta completa", () => {
    expect(countEntityAttachmentsById("1/movement", [
      { name: "1/movement/843/ticket.jpg" },
      { name: "ticket-without-path.jpg" },
      {},
    ])).toEqual({ 843: 1 });
  });
});
