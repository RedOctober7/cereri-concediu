import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  createClient: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabase.createClient,
}));

/** Modulul ține clientul în memorie: fiecare test îl importă din nou. */
async function loadStorage() {
  vi.resetModules();
  return import("@/lib/supabase-storage");
}

describe("Supabase Storage", () => {
  beforeEach(() => {
    supabase.createClient.mockReset();
    supabase.upload.mockReset();
    supabase.createClient.mockReturnValue({
      storage: { from: () => ({ upload: supabase.upload }) },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("fără variabile importul nu aruncă, iar stocarea aruncă StorageNotConfiguredError", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { uploadPDF, StorageNotConfiguredError } = await loadStorage();

    await expect(uploadPDF("u1", "r1", Buffer.from("pdf"))).rejects.toBeInstanceOf(
      StorageNotConfiguredError
    );
    expect(supabase.createClient).not.toHaveBeenCalled();
  });

  it("creează clientul la prima folosire, o singură dată", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proiect.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    supabase.upload.mockResolvedValue({ data: {}, error: null });
    const { uploadPDF } = await loadStorage();

    expect(supabase.createClient).not.toHaveBeenCalled();
    await expect(uploadPDF("u1", "r1", Buffer.from("pdf"))).resolves.toBe("cereri/u1/r1.pdf");
    await uploadPDF("u1", "r2", Buffer.from("pdf"));

    expect(supabase.createClient).toHaveBeenCalledOnce();
    expect(supabase.createClient.mock.calls[0].slice(0, 2)).toEqual([
      "https://proiect.supabase.co",
      "service-key",
    ]);
  });
});
