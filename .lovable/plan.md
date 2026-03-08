

# Contacts Page Enhancements

## Changes

### 1. CSV File Upload with Drag-and-Drop (`Contacts.tsx`)
- Add a drag-and-drop zone in the Import CSV dialog alongside the existing textarea
- Use native HTML5 drag events (`onDragOver`, `onDrop`) and a hidden `<input type="file" accept=".csv">`
- When a file is dropped/selected, read it with `FileReader.readAsText()` and populate the `csvText` state
- Visual feedback: dashed border that highlights on drag-over

### 2. Import to Campaign Button (`Contacts.tsx`)
- Add an "Import to Campaign" button in the contacts toolbar (next to Export)
- On click, navigate to `/campaigns` with `react-router-dom`'s `useNavigate`, passing the filtered contacts via `location.state`:
  ```
  navigate("/campaigns", { state: { importedContacts: filteredContacts } })
  ```

### 3. Campaigns Page Receives Imported Contacts (`Campaigns.tsx`)
- Read `location.state?.importedContacts` via `useLocation`
- If present, auto-open the New Campaign dialog and pre-fill `form.contactsRaw` with the imported contacts formatted as `email, name` per line

## Files Modified
| File | Change |
|------|--------|
| `src/pages/Contacts.tsx` | Add file upload drop zone, "Import to Campaign" button |
| `src/pages/Campaigns.tsx` | Read imported contacts from location state, auto-open dialog |

