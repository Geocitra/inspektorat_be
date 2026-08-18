import sys
import os
import json
import pymupdf  # Ganti import fitz untuk menghindari peringatan deprecation warning ke stdout

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing arguments. Usage: python pdf_to_images.py <pdf_path> <output_dir>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]

    if not os.path.exists(pdf_path):
        print(json.dumps({"error": f"PDF file not found: {pdf_path}"}))
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    try:
        doc = pymupdf.open(pdf_path)
        generated_files = []

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # Render page to image at 2x resolution (matrix zoom=2.0) for sharp OCR reading
            zoom = 2.0
            mat = pymupdf.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            
            output_file_name = f"page_{page_num + 1}.jpg"
            output_file_path = os.path.join(output_dir, output_file_name)
            pix.save(output_file_path)
            generated_files.append(os.path.abspath(output_file_path).replace("\\", "/"))

        print(json.dumps({"success": True, "files": generated_files}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
